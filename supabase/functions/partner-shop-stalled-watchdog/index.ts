import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Detecta pedidos em "processing" travados (sem progresso em execucoes_lovable)
// e estorna automaticamente para o saldo do cliente, liberando o bot.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Janelas de tolerância (configuráveis via querystring para ops manual)
  const u = new URL(req.url);
  const stallMinutes = Math.max(3, Number(u.searchParams.get("stallMinutes") ?? "8"));
  const minAssignedMinutes = Math.max(2, Number(u.searchParams.get("minAssignedMinutes") ?? "5"));

  const cutoffStall = new Date(Date.now() - stallMinutes * 60_000).toISOString();
  const cutoffAssigned = new Date(Date.now() - minAssignedMinutes * 60_000).toISOString();

  try {
    // 1) Pega pedidos em processing com assigned_at antigo o suficiente
    const { data: orders, error: ordErr } = await sb
      .from("partner_credit_orders")
      .select("id, partner_id, assigned_bot_id, target_workspace, assigned_at, paid_at, credits, customer_email, multi_workspace_mode, workspaces_total, workspaces_done, stop_requested_at, schedule_id")
      .eq("status", "processing")
      .lt("assigned_at", cutoffAssigned)
      .order("assigned_at", { ascending: true })
      .limit(50);

    if (ordErr) return json(500, { error: ordErr.message });
    if (!orders || orders.length === 0) {
      return json(200, { ok: true, checked: 0, refunded: [] });
    }

    const refunded: Array<{ orderId: string; refunded: number; reason: string }> = [];
    const skipped: Array<{ orderId: string; reason: string }> = [];

    for (const o of orders) {
      // Descobre email do bot atribuído
      let botEmail: string | null = null;
      if (o.assigned_bot_id) {
        const { data: bot } = await sb
          .from("farm_bots")
          .select("email_lovable")
          .eq("id", o.assigned_bot_id)
          .maybeSingle();
        botEmail = bot?.email_lovable ?? null;
      }

      const since = o.assigned_at ?? o.paid_at;

      // Última atividade em execucoes_lovable
      // - Single-ws: filtra por workspace
      // - Multi-ws: filtra só por bot/parceiro (workspace varia)
      let lastUpdate: string | null = null;
      if (botEmail && since) {
        let q = sb
          .from("execucoes_lovable")
          .select("atualizado_em")
          .eq("id_do_usuario", o.partner_id)
          .eq("email_lovable", botEmail)
          .gte("iniciado_em", since)
          .order("atualizado_em", { ascending: false })
          .limit(1);
        if (!o.multi_workspace_mode && o.target_workspace) {
          q = q.eq("workspace_nome", o.target_workspace);
        }
        const { data: exec } = await q.maybeSingle();
        lastUpdate = exec?.atualizado_em ?? null;
      }

      // Critérios de stall (qualquer um):
      // - Stop foi pedido há > 2 min e ainda processing → worker não respondeu
      // - Multi-ws nunca iniciou (workspaces_total NULL) e assigned há > cutoffStall
      // - Sem execução desde assigned_at e assigned_at < cutoffStall
      // - Última execução com atualizado_em < cutoffStall
      const stopMs = o.stop_requested_at ? Date.parse(o.stop_requested_at) : 0;
      const stopOld = stopMs > 0 && Date.now() - stopMs > 2 * 60_000;
      const multiNeverStarted = o.multi_workspace_mode === true && o.workspaces_total == null;
      const assignedOld = o.assigned_at && o.assigned_at < cutoffStall;
      const execOld = lastUpdate && lastUpdate < cutoffStall;
      const isStalled = stopOld || (multiNeverStarted && assignedOld) || (!lastUpdate && assignedOld) || execOld;

      if (!isStalled) {
        skipped.push({ orderId: o.id, reason: "still_progressing" });
        continue;
      }

      const reasonTag = stopOld
        ? "stop_unresponsive"
        : multiNeverStarted
        ? "multi_ws_never_started"
        : lastUpdate
        ? "exec_update_stalled"
        : "no_exec_since_assigned";

      const { data: refundedCredits, error: refErr } = await sb.rpc("refund_order_remainder", {
        _order_id: o.id,
        _reason: `worker_stalled_auto:${reasonTag}`,
      });
      if (refErr) {
        skipped.push({ orderId: o.id, reason: `rpc_error:${refErr.message}` });
        continue;
      }

      // Se veio de uma programação, pausa pra evitar repetir o problema amanhã
      if (o.schedule_id) {
        try {
          await sb
            .from("partner_order_schedules")
            .update({
              status: "paused",
              runs_failed: ((o as { runs_failed?: number }).runs_failed ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", o.schedule_id);
        } catch (e) {
          console.warn("pause schedule err", e);
        }
      }

      // Tenta puxar próximo da fila do parceiro
      await sb.rpc("assign_next_queued_order", { _partner_id: o.partner_id });

      refunded.push({
        orderId: o.id,
        refunded: Number(refundedCredits ?? 0),
        reason: reasonTag,
      });
    }

    console.log("[watchdog] checked=", orders.length, "refunded=", refunded.length);
    return json(200, {
      ok: true,
      checked: orders.length,
      refunded,
      skipped,
      stallMinutes,
      minAssignedMinutes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    console.error("[watchdog] error:", msg);
    return json(500, { error: msg });
  }
});