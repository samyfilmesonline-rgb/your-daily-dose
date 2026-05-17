import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  orderId: z.string().uuid(),
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
    if (!parsed.success) return json(400, { error: "Parâmetros inválidos" });

    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: isAdminRpc } = await sb.rpc("has_role", { _user_id: callerId, _role: "admin" });
    const isAdmin = !!isAdminRpc;

    const { data: order, error: ordErr } = await sb
      .from("partner_credit_orders")
      .select("id, partner_id, is_manual, status, assigned_bot_id")
      .eq("id", parsed.data.orderId)
      .maybeSingle();
    if (ordErr || !order) return json(404, { error: "Pedido não encontrado" });
    if (!order.is_manual) return json(400, { error: "Pedido não é manual" });
    if (!isAdmin && order.partner_id !== callerId) return json(403, { error: "Sem permissão" });
    if (String(order.status) === "processing") {
      return new Response(
        JSON.stringify({ error: "Pedido em processamento. Aguarde o worker liberar." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!["refunded", "failed"].includes(String(order.status))) {
      return json(400, { error: `Status atual (${order.status}) não permite retry` });
    }

    if (order.assigned_bot_id) {
      const { data: bot } = await sb
        .from("farm_bots")
        .select("status, last_heartbeat_at")
        .eq("id", order.assigned_bot_id)
        .maybeSingle();
      if (bot && bot.status === "busy") {
        const hb = bot.last_heartbeat_at ? new Date(bot.last_heartbeat_at).getTime() : 0;
        if (hb && Date.now() - hb < 90_000) {
          return new Response(
            JSON.stringify({ error: "Bot ainda ocupado. Aguarde o worker liberar." }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
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

    const { data: result, error: rpcErr } = await sb.rpc("retry_manual_order", {
      _order_id: order.id,
    });
    if (rpcErr) return json(400, { error: rpcErr.message });

    return json(200, result ?? { ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    console.error("retry-manual-order", err);
    return json(500, { error: msg });
  }
});