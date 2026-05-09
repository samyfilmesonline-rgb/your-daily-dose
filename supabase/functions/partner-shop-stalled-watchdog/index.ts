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
      .select("id, partner_id, assigned_bot_id, target_workspace, assigned_at, paid_at, credits, customer_email")
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

      // Última atividade em execucoes_lovable para esse pedido
      let lastUpdate: string | null = null;
      if (botEmail && o.target_workspace && since) {
        const { data: exec } = await sb
          .from("execucoes_lovable")
          .select("atualizado_em")
          .eq("id_do_usuario", o.partner_id)
          .eq("email_lovable", botEmail)
          .eq("workspace_nome", o.target_workspace)
          .gte("iniciado_em", since)
          .order("atualizado_em", { ascending: false })
          .limit(1)
          .maybeSingle();
        lastUpdate = exec?.atualizado_em ?? null;
      }

      // Critério de stall:
      // - Nenhuma execução desde assigned_at (lastUpdate null) E assigned_at < cutoffStall, OU
      // - Última execução com atualizado_em < cutoffStall
      const assignedOld = o.assigned_at && o.assigned_at < cutoffStall;
      const execOld = lastUpdate && lastUpdate < cutoffStall;
      const isStalled = (!lastUpdate && assignedOld) || execOld;

      if (!isStalled) {
        skipped.push({ orderId: o.id, reason: "still_progressing" });
        continue;
      }

      const { data: refundedCredits, error: refErr } = await sb.rpc("refund_order_remainder", {
        _order_id: o.id,
        _reason: "worker_stalled_auto",
      });
      if (refErr) {
        skipped.push({ orderId: o.id, reason: `rpc_error:${refErr.message}` });
        continue;
      }

      // Tenta puxar próximo da fila do parceiro
      await sb.rpc("assign_next_queued_order", { _partner_id: o.partner_id });

      refunded.push({
        orderId: o.id,
        refunded: Number(refundedCredits ?? 0),
        reason: lastUpdate ? "exec_update_stalled" : "no_exec_since_assigned",
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