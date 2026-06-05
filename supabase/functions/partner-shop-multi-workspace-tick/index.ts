import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { cleanWorkspaceName, dedupeWorkspaces, normalizeWorkspaceKey, isStatusLikeWorkspace } from "../_shared/workspace-name.ts";
import { PER_WORKSPACE_DAILY_CAP, getWorkspaceCooldownUntil, createCooldownSchedule } from "../_shared/limits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    orderId: z.string().uuid(),
    fingerprint: z.string().min(8).max(256),
    workspaces: z.array(z.string().min(1).max(200)).min(1).max(500),
  }),
  z.object({
    action: z.literal("next"),
    orderId: z.string().uuid(),
    fingerprint: z.string().min(8).max(256),
    finishedWorkspace: z.string().min(1).max(200),
    farmed: z.number().int().min(0).max(10000).optional().default(200),
  }),
  z.object({
    action: z.literal("fail"),
    orderId: z.string().uuid(),
    fingerprint: z.string().min(8).max(256),
    workspace: z.string().min(1).max(200),
    reason: z.string().max(500).optional().default(""),
  }),
  z.object({
    action: z.literal("limit_reached"),
    orderId: z.string().uuid(),
    fingerprint: z.string().min(8).max(256),
    workspace: z.string().min(1).max(200).optional(),
    reason: z.string().max(500).optional().default("stripe_daily_farm_limit_reached"),
  }),
]);

const PER_WS = PER_WORKSPACE_DAILY_CAP;

type WsItem = {
  name: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  farmed: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  limited?: boolean;
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logEvent(
  sb: ReturnType<typeof createClient>,
  order: Record<string, unknown>,
  eventType: string,
  metadata: Record<string, unknown>,
) {
  try {
    await sb.from("payment_events").insert({
      source: "partner_order",
      source_id: order.id,
      event_type: eventType,
      partner_id: order.partner_id,
      customer_email: order.customer_email,
      customer_name: order.customer_name,
      customer_whatsapp: order.customer_whatsapp,
      amount_cents: order.amount_cents,
      credits: order.credits,
      status_before: order.status,
      status_after: order.status,
      metadata,
    });
  } catch (e) {
    console.warn("logEvent err", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return json(400, { error: "Parâmetros inválidos", details: parsed.error.flatten() });
    }
    const b = parsed.data;

    // Load order + bot
    const { data: order, error: ordErr } = await sb
      .from("partner_credit_orders")
      .select(
        "id, partner_id, status, multi_workspace_mode, workspaces_total, workspaces_done, workspaces_plan, current_workspace, target_workspace, price_cents_per_workspace, credits, amount_cents, customer_name, customer_email, customer_whatsapp, assigned_bot_id, stop_requested_at, paid_at, schedule_id",
      )
      .eq("id", b.orderId)
      .maybeSingle();
    if (ordErr || !order) return json(404, { error: "Pedido não encontrado" });
    // Single-workspace limit_reached path (worker reportou limite diário)
    if (!order.multi_workspace_mode) {
      if (b.action !== "limit_reached") {
        return json(400, { error: "Pedido não está no modo multi-workspace" });
      }
      if (!order.assigned_bot_id) return json(400, { error: "Pedido não tem bot atribuído" });
      const { data: bot } = await sb
        .from("farm_bots")
        .select("id, email_lovable")
        .eq("id", order.assigned_bot_id)
        .maybeSingle();
      if (!bot) return json(404, { error: "Bot não encontrado" });
      if (!b.fingerprint || b.fingerprint.length < 8) return json(401, { error: "Fingerprint inválido" });

      const nowIso = new Date().toISOString();
      const targetCredits = Math.max(Number(order.credits ?? 200), 200);
      await sb
        .from("partner_credit_orders")
        .update({
          status: "delivered",
          credits: targetCredits,
          delivered_at: nowIso,
          failed_reason: null,
          current_workspace: null,
          target_workspace: null,
          last_workspace: order.current_workspace ?? order.target_workspace,
        })
        .eq("id", order.id);

      // execucoes_lovable: registrar limite
      try {
        await sb.from("execucoes_lovable").insert({
          id_do_usuario: order.partner_id,
          email_lovable: bot.email_lovable,
          workspace_nome: order.current_workspace ?? order.target_workspace ?? null,
          creditos_adicionados: 200,
          status: "limite",
          erro: b.reason || "stripe_daily_farm_limit_reached",
          iniciado_em: nowIso,
          finalizado_em: nowIso,
        });
      } catch (e) {
        console.warn("execucoes_lovable insert err", e);
      }

      // libera bot e atribui próximo
      await sb
        .from("farm_bots")
        .update({ status: "idle", current_order_id: null, last_heartbeat_at: nowIso })
        .eq("id", bot.id)
        .eq("current_order_id", order.id);
      try {
        await sb.rpc("assign_next_queued_order", { _partner_id: order.partner_id });
      } catch (e) {
        console.warn("assign_next_queued_order err", e);
      }

      await logEvent(sb, { ...order, status: "delivered", credits: targetCredits }, "order_limit_reached", {
        reason: b.reason || "stripe_daily_farm_limit_reached",
        workspace: order.current_workspace ?? order.target_workspace ?? null,
      });

      return json(200, { ok: true, done: true, finalStatus: "delivered", reason: "stripe_daily_farm_limit_reached" });
    }
    if (!order.assigned_bot_id) return json(400, { error: "Pedido não tem bot atribuído" });

    const { data: bot } = await sb
      .from("farm_bots")
      .select("id, partner_id")
      .eq("id", order.assigned_bot_id)
      .maybeSingle();
    if (!bot) return json(404, { error: "Bot não encontrado" });

    // Fingerprint validation: armazenado em raw_payload? Não — usamos hash simples do bot.id + partner_id como contrato leve.
    // Para coerência com confirm-invite, aceitamos qualquer fingerprint estável; rejeitamos vazio.
    if (!b.fingerprint || b.fingerprint.length < 8) {
      return json(401, { error: "Fingerprint inválido" });
    }

    // STOP curto-circuito
    const stopRequested = !!order.stop_requested_at;

    if (b.action === "start") {
      if (order.workspaces_total != null) {
        // já iniciado — devolve current
        return json(200, {
          ok: true,
          alreadyStarted: true,
          currentWorkspace: order.current_workspace,
          workspacesTotal: order.workspaces_total,
          workspacesDone: order.workspaces_done,
        });
      }

      // Quota: respeita limite do parceiro, trunca lista se necessário
      const { data: pq } = await sb
        .from("parceiros")
        .select("limite_creditos, creditos_consumidos")
        .eq("user_id", order.partner_id)
        .maybeSingle();
      const remaining = pq ? Math.max(0, Number(pq.limite_creditos) - Number(pq.creditos_consumidos)) : 0;
      const maxWs = Math.floor(remaining / PER_WS);
      const cleanedList = dedupeWorkspaces(b.workspaces).filter((n) => !isStatusLikeWorkspace(n));
      if (cleanedList.length === 0) {
        return json(400, { error: "Nenhum workspace válido informado" });
      }
      const allowedByQuota = cleanedList.slice(0, Math.max(0, maxWs));
      if (allowedByQuota.length === 0) {
        await sb
          .from("partner_credit_orders")
          .update({ status: "failed", failed_reason: "insufficient_quota_no_workspace" })
          .eq("id", order.id);
        await sb
          .from("farm_bots")
          .update({ status: "idle", current_order_id: null })
          .eq("id", bot.id)
          .eq("current_order_id", order.id);
        return json(400, { error: "Quota insuficiente para iniciar" });
      }

      // Cooldown 20/24h por workspace: separa prontos x bloqueados
      const ready: string[] = [];
      const blocked: Array<{ name: string; cooldownUntil: string }> = [];
      for (const ws of allowedByQuota) {
        const cd = await getWorkspaceCooldownUntil(sb, ws);
        if (cd) blocked.push({ name: ws, cooldownUntil: cd });
        else ready.push(ws);
      }

      // Cria schedules one-shot para os bloqueados
      const scheduledIds: string[] = [];
      for (const item of blocked) {
        try {
          const sid = await createCooldownSchedule(sb, {
            partnerId: order.partner_id as string,
            botId: order.assigned_bot_id as string | null,
            customerName: order.customer_name as string,
            customerEmail: order.customer_email as string,
            customerWhatsapp: order.customer_whatsapp as string | null,
            targetWorkspace: item.name,
            credits: PER_WORKSPACE_DAILY_CAP,
            amountCentsPerRun: Number(order.price_cents_per_workspace ?? 0),
            scheduledFor: item.cooldownUntil,
            notes: `auto-reagendado por cooldown 20/24h (origem: pedido ${order.id})`,
            createdBy: order.partner_id as string,
          });
          scheduledIds.push(sid);
        } catch (e) {
          console.warn("createCooldownSchedule err", e);
        }
      }

      const allowed = ready;
      if (allowed.length === 0) {
        // Nada para rodar agora — tudo agendado
        await sb
          .from("partner_credit_orders")
          .update({
            status: "refunded",
            failed_reason: "all_workspaces_in_cooldown",
            workspaces_total: 0,
            workspaces_done: 0,
          })
          .eq("id", order.id);
        await sb
          .from("farm_bots")
          .update({ status: "idle", current_order_id: null })
          .eq("id", bot.id)
          .eq("current_order_id", order.id);
        return json(200, {
          ok: true,
          scheduledOnly: true,
          scheduledIds,
          blocked,
          message: "Todos os workspaces estão no cooldown de 24h. Pedidos agendados.",
        });
      }

      const total = allowed.length;
      const totalCredits = total * PER_WS;
      const totalCents = total * Number(order.price_cents_per_workspace ?? 0);
      const nowIso = new Date().toISOString();
      const plan: WsItem[] = allowed.map((name, i) => ({
        name,
        status: i === 0 ? "running" : "pending",
        farmed: 0,
        started_at: i === 0 ? nowIso : null,
        finished_at: null,
        error: null,
      }));

      // Debita quota total
      const { error: debitErr } = await sb.rpc("debit_partner_quota", {
        _partner_id: order.partner_id,
        _amount: totalCredits,
        _order_id: order.id,
        _reason: `manual_multi_ws:${total}ws`,
      });
      if (debitErr) return json(400, { error: debitErr.message });

      const first = allowed[0];
      const { error: updErr } = await sb
        .from("partner_credit_orders")
        .update({
          status: "processing",
          workspaces_total: total,
          workspaces_done: 0,
          workspaces_plan: plan,
          current_workspace: first,
          target_workspace: first,
          credits: totalCredits,
          amount_cents: totalCents,
          assigned_at: order["paid_at"] ?? nowIso,
        })
        .eq("id", order.id);
      if (updErr) return json(500, { error: updErr.message });

      await logEvent(sb, { ...order, status: "processing", credits: totalCredits, amount_cents: totalCents }, "multi_ws_started", {
        total,
        workspaces: allowed,
        current: first,
      });

      return json(200, {
        ok: true,
        currentWorkspace: first,
        workspacesTotal: total,
        workspacesDone: 0,
        truncated: allowed.length < b.workspaces.length,
        scheduledIds,
        blocked,
      });
    }

    // Para next/fail/limit_reached: precisamos do plan
    const plan = (order.workspaces_plan as WsItem[] | null) ?? [];
    if (!plan.length) return json(400, { error: "Plano de workspaces ausente — chame action=start primeiro" });

    const targetName =
      b.action === "next"
        ? b.finishedWorkspace
        : b.action === "limit_reached"
        ? (b.workspace ?? order.current_workspace ?? "")
        : b.workspace;
    if (!targetName) return json(400, { error: "workspace é obrigatório" });
    let idx = plan.findIndex((w) => w.name === targetName);
    if (idx < 0) {
      const cleanedTarget = cleanWorkspaceName(targetName);
      idx = plan.findIndex((w) => w.name === cleanedTarget);
    }
    if (idx < 0) {
      const key = normalizeWorkspaceKey(targetName);
      idx = plan.findIndex((w) => normalizeWorkspaceKey(w.name) === key);
    }
    if (idx < 0) return json(400, { error: `Workspace '${targetName}' não está no plano` });

    const nowIso = new Date().toISOString();
    if (b.action === "next") {
      plan[idx].status = "done";
      plan[idx].farmed = Math.max(plan[idx].farmed, b.farmed);
      plan[idx].finished_at = nowIso;
      plan[idx].error = null;
    } else if (b.action === "limit_reached") {
      plan[idx].status = "done";
      plan[idx].farmed = Math.max(plan[idx].farmed, 200);
      plan[idx].finished_at = nowIso;
      plan[idx].error = b.reason || "stripe_daily_farm_limit_reached";
      plan[idx].limited = true;
    } else {
      plan[idx].status = "failed";
      plan[idx].finished_at = nowIso;
      plan[idx].error = b.reason || "unknown";
    }

    const done = plan.filter((w) => w.status === "done" || w.status === "failed" || w.status === "skipped").length;

    // Decide próximo
    let next: WsItem | null = null;
    const scheduledFromNext: Array<{ name: string; cooldownUntil: string; scheduleId: string }> = [];
    if (!stopRequested) {
      // Pula workspaces em cooldown e cria schedules para eles
      while (true) {
        const candidate = plan.find((w) => w.status === "pending") ?? null;
        if (!candidate) { next = null; break; }
        const cd = await getWorkspaceCooldownUntil(sb, candidate.name);
        if (!cd) {
          candidate.status = "running";
          candidate.started_at = nowIso;
          next = candidate;
          break;
        }
        candidate.status = "skipped";
        candidate.finished_at = nowIso;
        candidate.error = "cooldown_24h";
        try {
          const sid = await createCooldownSchedule(sb, {
            partnerId: order.partner_id as string,
            botId: order.assigned_bot_id as string | null,
            customerName: order.customer_name as string,
            customerEmail: order.customer_email as string,
            customerWhatsapp: order.customer_whatsapp as string | null,
            targetWorkspace: candidate.name,
            credits: PER_WORKSPACE_DAILY_CAP,
            amountCentsPerRun: Number(order.price_cents_per_workspace ?? 0),
            scheduledFor: cd,
            notes: `auto-reagendado por cooldown 20/24h (origem: pedido ${order.id})`,
            createdBy: order.partner_id as string,
          });
          scheduledFromNext.push({ name: candidate.name, cooldownUntil: cd, scheduleId: sid });
        } catch (e) {
          console.warn("createCooldownSchedule err (next)", e);
        }
      }
    } else {
      // marcar restantes como skipped
      plan.forEach((w) => {
        if (w.status === "pending") {
          w.status = "skipped";
          w.finished_at = nowIso;
        }
      });
    }

    const isFinal = !next;
    let finalStatus: string = order.status as string;
    let finalCredits = order.credits as number;
    let finalAmountCents = order.amount_cents as number;

    if (isFinal) {
      const doneCount = plan.filter((w) => w.status === "done").length;
      const failedCount = plan.filter((w) => w.status === "failed").length;
      const skippedCount = plan.filter((w) => w.status === "skipped").length;
      const farmedTotal = plan.reduce((acc, w) => acc + (w.status === "done" ? w.farmed : 0), 0);
      const pricePer = Number(order.price_cents_per_workspace ?? 0);

      finalCredits = farmedTotal;
      finalAmountCents = doneCount * pricePer;

      if (stopRequested) finalStatus = "refunded";
      else if (doneCount === 0) finalStatus = "failed";
      else finalStatus = "delivered";

      // refund da diferença (créditos que sobraram do que foi debitado mas não rodaram)
      try {
        await sb.rpc("refund_order_remainder", {
          _order_id: order.id,
          _reason: stopRequested ? "stopped_by_admin" : failedCount > 0 || skippedCount > 0 ? "partial_failure" : "completed",
        });
      } catch (e) {
        console.warn("refund_order_remainder err", e);
      }
    }

    const updatePayload: Record<string, unknown> = {
      workspaces_plan: plan,
      workspaces_done: done,
    };
    if (next) {
      updatePayload["current_workspace"] = next.name;
      updatePayload["target_workspace"] = next.name;
    }
    if (isFinal) {
      updatePayload["status"] = finalStatus;
      updatePayload["credits"] = finalCredits;
      updatePayload["amount_cents"] = finalAmountCents;
      updatePayload["delivered_at"] = finalStatus === "delivered" ? nowIso : null;
      updatePayload["current_workspace"] = null;
      updatePayload["target_workspace"] = null;
      if (finalStatus === "failed") {
        updatePayload["failed_reason"] = "all_workspaces_failed";
      }
      if (finalStatus === "refunded") {
        updatePayload["failed_reason"] = stopRequested ? "stopped_by_customer" : "partial_refund";
      }
    }

    const { error: updErr } = await sb
      .from("partner_credit_orders")
      .update(updatePayload)
      .eq("id", order.id);
    if (updErr) return json(500, { error: updErr.message });

    if (isFinal) {
      // libera bot e atribui próximo da fila
      await sb
        .from("farm_bots")
        .update({ status: "idle", current_order_id: null, last_heartbeat_at: nowIso })
        .eq("id", bot.id)
        .eq("current_order_id", order.id);
      try {
        await sb.rpc("assign_next_queued_order", { _partner_id: order.partner_id });
      } catch (e) {
        console.warn("assign_next_queued_order err", e);
      }

      // Se veio de uma programação, contabiliza ok/falha — pausa após 2 falhas seguidas
      if ((order as { schedule_id?: string | null }).schedule_id) {
        try {
          const sid = (order as { schedule_id: string }).schedule_id;
          const { data: sch } = await sb
            .from("partner_order_schedules")
            .select("runs_completed, runs_failed, status")
            .eq("id", sid)
            .maybeSingle();
          if (sch) {
            const okIncr = finalStatus === "delivered" ? 1 : 0;
            const failIncr = finalStatus === "delivered" ? 0 : 1;
            const newFailed = (sch.runs_failed ?? 0) + failIncr;
            const shouldPause = failIncr === 1 && newFailed >= 2 && sch.status === "active";
            await sb
              .from("partner_order_schedules")
              .update({
                runs_completed: (sch.runs_completed ?? 0) + okIncr,
                runs_failed: newFailed,
                status: shouldPause ? "paused" : sch.status,
                last_run_at: nowIso,
                updated_at: nowIso,
              })
              .eq("id", sid);
          }
        } catch (e) {
          console.warn("schedule update err", e);
        }
      }
    }

    await logEvent(
      sb,
      { ...order, status: isFinal ? finalStatus : "processing", credits: finalCredits, amount_cents: finalAmountCents },
      b.action === "limit_reached"
        ? "workspace_limit_reached"
        : isFinal
        ? `multi_ws_${finalStatus}`
        : "workspace_advanced",
      {
        finished: targetName,
        finishedStatus: plan[idx].status,
        next: next?.name ?? null,
        done,
        total: plan.length,
        reason: b.action === "limit_reached" ? (b.reason || "stripe_daily_farm_limit_reached") : undefined,
      },
    );

    // Registrar execucao limite quando vier do limit_reached
    if (b.action === "limit_reached") {
      try {
        await sb.from("execucoes_lovable").insert({
          id_do_usuario: order.partner_id,
          email_lovable: (await sb.from("farm_bots").select("email_lovable").eq("id", bot.id).maybeSingle()).data?.email_lovable ?? null,
          workspace_nome: targetName,
          creditos_adicionados: 200,
          status: "limite",
          erro: b.reason || "stripe_daily_farm_limit_reached",
          iniciado_em: nowIso,
          finalizado_em: nowIso,
        });
      } catch (e) {
        console.warn("execucoes_lovable insert err", e);
      }
    }

    return json(200, {
      ok: true,
      next: next?.name ?? null,
      done: isFinal,
      finalStatus: isFinal ? finalStatus : null,
      workspacesDone: done,
      workspacesTotal: plan.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    console.error("multi-workspace-tick", err);
    return json(500, { error: msg });
  }
});