import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BaseBody = z.object({
  partnerId: z.string().uuid().optional(),
  botId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().min(1).max(200),
  customerEmail: z.string().trim().email().max(255),
  customerWhatsapp: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().min(3).max(500),
  startAt: z.string().datetime().optional(),
  endMode: z.enum(["days", "until_date", "total_credits"]),
  totalDays: z.number().int().min(1).max(365).optional(),
  endAt: z.string().datetime().optional(),
  totalCreditsTarget: z.number().int().min(1).max(10_000_000).optional(),
});
const MultiBody = BaseBody.extend({
  mode: z.literal("multi").optional().default("multi"),
  pricePerWorkspaceCents: z.number().int().min(1).max(100_000_00),
});
const SingleBody = BaseBody.extend({
  mode: z.literal("single"),
  targetWorkspace: z.string().trim().min(1).max(200),
  credits: z.number().int().min(1).max(100_000),
  amountCents: z.number().int().min(0).max(100_000_00),
});
const Body = z.union([SingleBody, MultiBody]).superRefine((v, ctx) => {
  if (v.endMode === "days" && !v.totalDays) {
    ctx.addIssue({ code: "custom", message: "totalDays obrigatório", path: ["totalDays"] });
  }
  if (v.endMode === "until_date" && !v.endAt) {
    ctx.addIssue({ code: "custom", message: "endAt obrigatório", path: ["endAt"] });
  }
  if (v.endMode === "total_credits") {
    if (!v.totalCreditsTarget) {
      ctx.addIssue({ code: "custom", message: "totalCreditsTarget obrigatório", path: ["totalCreditsTarget"] });
    }
    if ((v as { mode?: string }).mode !== "single") {
      ctx.addIssue({ code: "custom", message: "end_mode=total_credits requer modo single", path: ["endMode"] });
    }
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

    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: isAdminRpc } = await sb.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    const isAdmin = !!isAdminRpc;

    const partnerId = b.partnerId ?? callerId;
    if (!isAdmin && partnerId !== callerId) {
      return json(403, { error: "Sem permissão" });
    }

    if (!isAdmin) {
      const { data: partnerRow } = await sb
        .from("parceiros")
        .select("status")
        .eq("user_id", callerId)
        .maybeSingle();
      if (!partnerRow || String(partnerRow.status).toLowerCase() !== "ativo") {
        return json(403, { error: "Parceiro inativo" });
      }
    }

    if (b.botId) {
      const { data: bot } = await sb
        .from("farm_bots")
        .select("id, partner_id")
        .eq("id", b.botId)
        .maybeSingle();
      if (!bot) return json(404, { error: "Bot não encontrado" });
      if (bot.partner_id !== partnerId) return json(403, { error: "Bot não pertence ao parceiro" });
    }

    const now = new Date();
    const requestedStart = b.startAt ? new Date(b.startAt) : now;
    // tolera até 1 minuto no passado; senão clampa pra agora
    const startAt = requestedStart.getTime() < now.getTime() - 60_000 ? now : requestedStart;
    const endAt = b.endMode === "until_date" ? new Date(b.endAt!) : null;
    if (endAt && endAt <= startAt) {
      return json(400, { error: "Data de término precisa estar no futuro" });
    }

    const isMulti = (b as { mode?: string }).mode !== "single";

    // Para single + total_credits, calcula total_days automaticamente
    let totalDays: number | null = b.endMode === "days" ? (b.totalDays ?? null) : null;
    let totalCreditsTarget: number | null = null;
    if (b.endMode === "total_credits") {
      const s = b as z.infer<typeof SingleBody>;
      totalCreditsTarget = b.totalCreditsTarget!;
      totalDays = Math.ceil(totalCreditsTarget / s.credits);
    }

    const insertRow: Record<string, unknown> = {
      partner_id: partnerId,
      bot_id: b.botId ?? null,
      created_by: callerId,
      customer_name: b.customerName,
      customer_email: b.customerEmail.toLowerCase(),
      customer_whatsapp: b.customerWhatsapp ?? null,
      notes: b.notes,
      workspaces: [],
      multi_workspace_mode: isMulti,
      start_at: startAt.toISOString(),
      end_mode: b.endMode,
      total_days: totalDays,
      total_credits_target: totalCreditsTarget,
      end_at: endAt ? endAt.toISOString() : null,
      status: "active",
      next_run_at: startAt.toISOString(),
    };
    if (isMulti) {
      insertRow.price_cents_per_workspace = (b as z.infer<typeof MultiBody>).pricePerWorkspaceCents;
    } else {
      const s = b as z.infer<typeof SingleBody>;
      insertRow.target_workspace = s.targetWorkspace;
      insertRow.credits_per_run = s.credits;
      insertRow.amount_cents_per_run = s.amountCents;
    }
    const { data: created, error: insErr } = await sb
      .from("partner_order_schedules")
      .insert(insertRow)
      .select("id")
      .single();
    if (insErr || !created) return json(500, { error: insErr?.message ?? "Falha ao criar" });

    // Só dispara primeiro tick se start_at <= agora (com pequena folga)
    if (startAt.getTime() <= Date.now() + 5_000) {
      try {
        await sb.functions.invoke("partner-shop-schedule-tick", { body: { scheduleId: created.id } });
      } catch (e) {
        console.warn("first tick err", e);
      }
    }

    return json(200, { ok: true, scheduleId: created.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    console.error("create-order-schedule", err);
    return json(500, { error: msg });
  }
});