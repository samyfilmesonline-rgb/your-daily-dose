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
      .select("id, status, tx_id, assigned_bot_id, paid_at")
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

    // Se ainda está paid sem bot (ex.: webhook chegou antes mas não havia bot idle),
    // tenta atribuir agora — função é idempotente para 'queued'/'paid'.
    if (status === "paid" || status === "queued" || !assignedBotId) {
      try {
        await sb.rpc("assign_bot_to_order", { _order_id: order.id });
      } catch (e) {
        console.warn("assign_bot_to_order err", e);
      }
    }

    // Recarrega o estado atualizado após eventuais atribuições
    const { data: fresh } = await sb
      .from("partner_credit_orders")
      .select("status, assigned_bot_id")
      .eq("id", order.id)
      .maybeSingle();
    if (fresh) {
      status = fresh.status;
      assignedBotId = fresh.assigned_bot_id ?? null;
    }

    if (assignedBotId) {
      const { data: bot } = await sb
        .from("farm_bots")
        .select("email_lovable")
        .eq("id", assignedBotId)
        .maybeSingle();
      botEmail = bot?.email_lovable ?? null;
    }

    return new Response(
      JSON.stringify({ status, botEmail, assignedBotId }),
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