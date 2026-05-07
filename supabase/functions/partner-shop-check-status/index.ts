import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkPixStatus } from "../_shared/abacate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({ orderId: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "orderId inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: order } = await sb
      .from("partner_credit_orders")
      .select("id, status, tx_id, assigned_bot_id, paid_at, target_workspace, credits, amount_cents, delivered_at, failed_reason, customer_email, partner_id, assigned_at, bot_invite_confirmed_at")
      .eq("id", parsed.data.orderId)
      .maybeSingle();
    if (!order) {
      return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let status = order.status;
    let botEmail: string | null = null;
    let assignedBotId: string | null = order.assigned_bot_id ?? null;
    let botStatus: string | null = null;
    let botHeartbeatAt: string | null = null;

    // Sync com gateway se ainda pendente
    if (status === "pending" && order.tx_id) {
      try {
        const remote = await checkPixStatus(order.tx_id);
        const isPaid =
          String(remote.status).toUpperCase() === "PAID" ||
          String(remote.status).toUpperCase() === "BILLING.PAID" ||
          String(remote.status).toUpperCase() === "PIXQRCODE.PAID";
        if (isPaid) {
          await sb
            .from("partner_credit_orders")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", order.id)
            .eq("status", "pending");
          await sb.rpc("assign_bot_to_order", { _order_id: order.id });
        }
      } catch (e) {
        console.warn("status check remote err", e);
      }
    }

    // Se ficou 'paid' ou 'queued' sem bot atribuído, tenta atribuir agora
    // (ex.: webhook chegou antes mas não havia bot idle no momento).
    if ((status === "paid" || status === "queued") && !assignedBotId) {
      try {
        await sb.rpc("assign_bot_to_order", { _order_id: order.id });
      } catch (e) {
        console.warn("assign_bot_to_order err", e);
      }
    }

    // Recarrega o estado atualizado após eventuais atribuições
    const { data: fresh } = await sb
      .from("partner_credit_orders")
      .select("status, assigned_bot_id, delivered_at, failed_reason, paid_at, assigned_at, bot_invite_confirmed_at")
      .eq("id", order.id)
      .maybeSingle();
    if (fresh) {
      status = fresh.status;
      assignedBotId = fresh.assigned_bot_id ?? null;
      order.delivered_at = fresh.delivered_at;
      order.failed_reason = fresh.failed_reason;
      order.paid_at = fresh.paid_at;
      order.assigned_at = fresh.assigned_at;
      order.bot_invite_confirmed_at = fresh.bot_invite_confirmed_at;
    }

    if (assignedBotId) {
      const { data: bot } = await sb
        .from("farm_bots")
        .select("email_lovable, status, last_heartbeat_at")
        .eq("id", assignedBotId)
        .maybeSingle();
      botEmail = bot?.email_lovable ?? null;
      botStatus = bot?.status ?? null;
      botHeartbeatAt = bot?.last_heartbeat_at ?? null;
    }

    // Progresso de farm a partir de execucoes_lovable
    let progress: {
      farmed: number;
      target: number;
      percent: number;
      attempts: number;
      lastEventAt: string | null;
      currentExecution: {
        id: string;
        status: string;
        creditosIniciais: number | null;
        creditosFinais: number | null;
        creditosAdicionados: number | null;
        atualizadoEm: string | null;
        iniciadoEm: string | null;
        erro: string | null;
      } | null;
      recent: Array<{
        id: string;
        status: string;
        creditosAdicionados: number | null;
        atualizadoEm: string | null;
        erro: string | null;
      }>;
    } = {
      farmed: 0,
      target: order.credits,
      percent: 0,
      attempts: 0,
      lastEventAt: null,
      currentExecution: null,
      recent: [],
    };
    if (botEmail && order.target_workspace && order.partner_id) {
      const sinceIso = order.assigned_at ?? order.paid_at ?? null;
      let q = sb
        .from("execucoes_lovable")
        .select("id, status, creditos_iniciais, creditos_finais, creditos_adicionados, iniciado_em, atualizado_em, erro")
        .eq("id_do_usuario", order.partner_id)
        .eq("email_lovable", botEmail)
        .eq("workspace_nome", order.target_workspace)
        .order("iniciado_em", { ascending: false })
        .limit(20);
      if (sinceIso) q = q.gte("iniciado_em", sinceIso);
      const { data: execs } = await q;
      const list = execs ?? [];
      progress.attempts = list.length;
      progress.farmed = list.reduce(
        (acc, r) => acc + (Number(r.creditos_adicionados) || 0),
        0
      );
      progress.percent =
        progress.target > 0
          ? Math.min(100, Math.round((progress.farmed / progress.target) * 100))
          : 0;
      progress.lastEventAt = list[0]?.atualizado_em ?? null;
      if (list[0]) {
        const r = list[0];
        progress.currentExecution = {
          id: r.id,
          status: r.status,
          creditosIniciais: r.creditos_iniciais,
          creditosFinais: r.creditos_finais,
          creditosAdicionados: r.creditos_adicionados,
          atualizadoEm: r.atualizado_em,
          iniciadoEm: r.iniciado_em,
          erro: r.erro,
        };
      }
      progress.recent = list.slice(0, 5).map((r) => ({
        id: r.id,
        status: r.status,
        creditosAdicionados: r.creditos_adicionados,
        atualizadoEm: r.atualizado_em,
        erro: r.erro,
      }));
    }

    return new Response(
      JSON.stringify({
        status,
        botEmail,
        assignedBotId,
        botStatus,
        botHeartbeatAt,
        targetWorkspace: order.target_workspace ?? null,
        credits: order.credits,
        amountCents: order.amount_cents,
        deliveredAt: order.delivered_at ?? null,
        failedReason: order.failed_reason ?? null,
        paidAt: order.paid_at ?? null,
        botInviteConfirmedAt: order.bot_invite_confirmed_at ?? null,
        progress,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});