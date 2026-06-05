import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { cleanWorkspaceName, isStatusLikeWorkspace } from "../_shared/workspace-name.ts";
import { PER_WORKSPACE_DAILY_CAP, getWorkspaceCooldownUntil, createCooldownSchedule } from "../_shared/limits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  partnerId: z.string().uuid().optional(),
  customerName: z.string().trim().min(1).max(200),
  customerEmail: z.string().trim().email().max(255),
  customerWhatsapp: z.string().trim().max(40).optional().nullable(),
  targetWorkspace: z.string().trim().min(1).max(200).optional(),
  credits: z.number().int().min(1).max(100000).optional(),
  amountCents: z.number().int().min(0).max(100_000_00).optional(),
  notes: z.string().trim().min(3).max(500),
  botId: z.string().uuid().optional().nullable(),
  multiWorkspaceMode: z.boolean().optional().default(false),
  pricePerWorkspaceCents: z.number().int().min(0).max(100_000_00).optional(),
}).superRefine((v, ctx) => {
  if (v.multiWorkspaceMode) {
    if (!v.botId) ctx.addIssue({ code: "custom", message: "botId é obrigatório no modo multi-workspace", path: ["botId"] });
    if (v.pricePerWorkspaceCents == null || v.pricePerWorkspaceCents < 1) {
      ctx.addIssue({ code: "custom", message: "pricePerWorkspaceCents deve ser >= 1", path: ["pricePerWorkspaceCents"] });
    }
  } else {
    if (!v.targetWorkspace) ctx.addIssue({ code: "custom", message: "targetWorkspace é obrigatório", path: ["targetWorkspace"] });
    if (v.credits == null) ctx.addIssue({ code: "custom", message: "credits é obrigatório", path: ["credits"] });
    if (v.amountCents == null) ctx.addIssue({ code: "custom", message: "amountCents é obrigatório", path: ["amountCents"] });
  }
});

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");

    const callerClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) return json(401, { error: "Unauthorized" });
    const callerId = userData.user.id;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return json(400, { error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const b = parsed.data;

    // Normalize single-ws target_workspace
    let targetWs = b.targetWorkspace ? cleanWorkspaceName(b.targetWorkspace) : "";
    if (!b.multiWorkspaceMode && !targetWs) {
      return json(400, { error: "Nenhum workspace válido informado" });
    }
    if (targetWs && isStatusLikeWorkspace(targetWs)) {
      return json(400, { error: `Workspace inválido: '${targetWs}' parece um rótulo de status` });
    }

    // Single-ws: força no máximo 20 créditos por pedido (limite 20/24h).
    if (!b.multiWorkspaceMode && b.credits != null && b.credits > PER_WORKSPACE_DAILY_CAP) {
      return json(400, {
        error: `Cada workspace só aceita até ${PER_WORKSPACE_DAILY_CAP} créditos a cada 24h. Reduza a quantidade.`,
      });
    }

    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Cooldown 20/24h (single-ws). Multi-ws é tratado pelo multi-workspace-tick.
    if (!b.multiWorkspaceMode && targetWs) {
      const cd = await getWorkspaceCooldownUntil(sb, targetWs);
      if (cd) {
        try {
          const scheduleId = await createCooldownSchedule(sb, {
            partnerId: b.partnerId ?? callerId,
            botId: b.botId ?? null,
            customerName: b.customerName,
            customerEmail: b.customerEmail,
            customerWhatsapp: b.customerWhatsapp,
            targetWorkspace: targetWs,
            credits: Number(b.credits),
            amountCentsPerRun: Number(b.amountCents ?? 0),
            scheduledFor: cd,
            notes: `cooldown 20/24h — manual reagendado: ${b.notes.slice(0, 120)}`,
            createdBy: callerId,
          });
          return json(200, {
            ok: true, scheduled: true, scheduleId, scheduledFor: cd,
            message: "Workspace em cooldown — pedido agendado.",
          });
        } catch (e) {
          console.error("schedule on cooldown err", e);
        }
      }
    }

    // admin check
    const { data: isAdminRpc } = await sb.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    const isAdmin = !!isAdminRpc;

    const partnerId = b.partnerId ?? callerId;
    if (!isAdmin && partnerId !== callerId) {
      return json(403, { error: "Sem permissão para criar pedido para outro parceiro" });
    }

    // If non-admin caller, must be active partner
    if (!isAdmin) {
      const { data: partnerRow } = await sb
        .from("parceiros")
        .select("user_id, status")
        .eq("user_id", callerId)
        .maybeSingle();
      if (!partnerRow || String(partnerRow.status).toLowerCase() !== "ativo") {
        return json(403, { error: "Parceiro inativo" });
      }
    }

    // Quota check: partner must have enough remaining credits
    {
      const { data: pq, error: pqErr } = await sb
        .from("parceiros")
        .select("limite_creditos, creditos_consumidos, status")
        .eq("user_id", partnerId)
        .maybeSingle();
      if (pqErr || !pq) return json(404, { error: "Parceiro não encontrado" });
      const remaining = Number(pq.limite_creditos) - Number(pq.creditos_consumidos);
      const minNeeded = b.multiWorkspaceMode ? 200 : Number(b.credits);
      if (remaining < minNeeded) {
        return json(400, {
          error: `Limite de créditos do parceiro insuficiente (restam ${Math.max(0, Math.floor(remaining))})`,
        });
      }
    }

    // Validate bot ownership / status
    let bot: { id: string; status: string; partner_id: string } | null = null;
    if (b.botId) {
      const { data: botRow, error: botErr } = await sb
        .from("farm_bots")
        .select("id, status, partner_id")
        .eq("id", b.botId)
        .maybeSingle();
      if (botErr || !botRow) return json(404, { error: "Bot não encontrado" });
      if (botRow.partner_id !== partnerId) {
        return json(403, { error: "Bot não pertence ao parceiro informado" });
      }
      bot = botRow as typeof bot;
    }

    const nowIso = new Date().toISOString();

    // Create order as 'paid' (manual order, no PIX)
    const orderInsert: Record<string, unknown> = {
      partner_id: partnerId,
      pack_id: null,
      customer_name: b.customerName,
      customer_email: b.customerEmail.toLowerCase(),
      customer_whatsapp: b.customerWhatsapp ?? null,
      status: "paid",
      is_manual: true,
      paid_at: nowIso,
      bot_invite_confirmed_at: nowIso,
      bot_invite_confirmed_fingerprint: "manual",
      tx_id: `manual:${crypto.randomUUID()}`,
      raw_payload: {
        manualOrder: {
          by: callerId,
          byIsAdmin: isAdmin,
          notes: b.notes,
          requestedBotId: b.botId ?? null,
          multiWorkspaceMode: !!b.multiWorkspaceMode,
          pricePerWorkspaceCents: b.pricePerWorkspaceCents ?? null,
          at: nowIso,
        },
      },
    };
    if (b.multiWorkspaceMode) {
      Object.assign(orderInsert, {
        target_workspace: null,
        credits: 0,
        amount_cents: 0,
        multi_workspace_mode: true,
        price_cents_per_workspace: b.pricePerWorkspaceCents,
      });
    } else {
      Object.assign(orderInsert, {
        target_workspace: targetWs,
        credits: b.credits,
        amount_cents: b.amountCents,
      });
    }
    const { data: created, error: insErr } = await sb
      .from("partner_credit_orders")
      .insert(orderInsert)
      .select("id")
      .single();
    if (insErr || !created) return json(500, { error: insErr?.message ?? "Falha ao criar pedido" });

    const orderId = created.id as string;

    // Debit partner quota (only single-ws here; multi debits in tick action=start)
    if (!b.multiWorkspaceMode) {
      const { error: debitErr } = await sb.rpc("debit_partner_quota", {
        _partner_id: partnerId,
        _amount: Number(b.credits),
        _order_id: orderId,
        _reason: `manual_order:${b.notes.slice(0, 180)}`,
      });
      if (debitErr) {
        await sb.from("partner_credit_orders").delete().eq("id", orderId);
        return json(400, { error: debitErr.message });
      }
    }

    // Assignment
    let finalStatus: "processing" | "queued" | "paid" = "paid";
    if (b.botId && bot) {
      if (bot.status === "idle") {
        // Atomically claim the bot only if still idle
        const { data: claimed, error: claimErr } = await sb
          .from("farm_bots")
          .update({ status: "busy", current_order_id: orderId })
          .eq("id", bot.id)
          .eq("status", "idle")
          .select("id")
          .maybeSingle();
        if (claimErr) console.warn("claim bot err", claimErr);
        if (claimed) {
          const { error: updErr } = await sb
            .from("partner_credit_orders")
            .update({
              status: "processing",
              assigned_bot_id: bot.id,
              assigned_at: nowIso,
            })
            .eq("id", orderId);
          if (updErr) console.warn("upd order err", updErr);
          finalStatus = "processing";
        } else {
          // bot just became busy -> queue
          await sb.from("partner_credit_orders").update({ status: "queued" }).eq("id", orderId);
          finalStatus = "queued";
        }
      } else {
        // bot busy/disabled -> queue
        await sb.from("partner_credit_orders").update({ status: "queued" }).eq("id", orderId);
        finalStatus = "queued";
      }
    } else {
      // No specific bot: use default assignment (idle bot or queue)
      const { error: rpcErr } = await sb.rpc("assign_bot_to_order", { _order_id: orderId });
      if (rpcErr) console.warn("assign_bot_to_order err", rpcErr);
      const { data: after } = await sb
        .from("partner_credit_orders")
        .select("status")
        .eq("id", orderId)
        .maybeSingle();
      finalStatus = (after?.status as typeof finalStatus) ?? "paid";
    }

    return json(200, { ok: true, orderId, status: finalStatus });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    console.error("create-manual-order", err);
    return json(500, { error: msg });
  }
});