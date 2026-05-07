import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  orderId: z.string().uuid(),
  notes: z.string().min(3).max(500),
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
    const { data: claimsData, error: claimsErr } = await callerClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json(401, { error: "Unauthorized" });
    const callerId = claimsData.claims.sub as string;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: "Parâmetros inválidos" });
    const { orderId, notes } = parsed.data;

    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: order, error: ordErr } = await sb
      .from("partner_credit_orders")
      .select("id, status, partner_id, customer_email, balance_applied_credits, raw_payload")
      .eq("id", orderId)
      .maybeSingle();
    if (ordErr || !order) return json(404, { error: "Pedido não encontrado" });

    // Authorization: partner-owner OR admin
    const isOwner = order.partner_id === callerId;
    let isAdmin = false;
    if (!isOwner) {
      const { data: roleData } = await sb.rpc("has_role", {
        _user_id: callerId,
        _role: "admin",
      });
      isAdmin = !!roleData;
    }
    if (!isOwner && !isAdmin) return json(403, { error: "Sem permissão" });

    if (order.status !== "pending") {
      return json(409, { error: `Pedido já está em status '${order.status}'` });
    }

    // Mark as paid (idempotent on status='pending')
    const newPayload = {
      ...((order.raw_payload as Record<string, unknown>) ?? {}),
      adminOverride: {
        by: callerId,
        notes,
        at: new Date().toISOString(),
      },
    };
    const { data: updated, error: updErr } = await sb
      .from("partner_credit_orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        failed_reason: null,
        raw_payload: newPayload,
      })
      .eq("id", orderId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (updErr) return json(500, { error: updErr.message });
    if (!updated) return json(409, { error: "Pedido foi atualizado por outro processo" });

    // Apply pending balance (cross-token or normal) — same flow as webhook
    if (Number(order.balance_applied_credits) > 0) {
      const cross = (order.raw_payload as { crossBalance?: { tokenHash?: string } } | null)?.crossBalance;
      const { data: applied } = cross?.tokenHash
        ? await sb.rpc("apply_balance_with_token", {
            _partner_id: order.partner_id,
            _order_id: orderId,
            _amount: Number(order.balance_applied_credits),
            _token_hash: cross.tokenHash,
          })
        : await sb.rpc("apply_balance_to_order", {
            _partner_id: order.partner_id,
            _customer_email: order.customer_email,
            _amount: Number(order.balance_applied_credits),
            _order_id: orderId,
          });
      if (!applied || Number(applied) === 0) {
        await sb
          .from("partner_credit_orders")
          .update({ balance_applied_credits: 0, balance_applied_cents: 0 })
          .eq("id", orderId);
      }
    }

    // Audit ledger entry (delta=0 for tracking only)
    await sb.from("partner_credit_ledger").insert({
      partner_id: order.partner_id,
      customer_email: order.customer_email,
      order_id: orderId,
      delta: 0,
      reason: `manual_paid_override:${notes.slice(0, 200)}`,
    });

    // Assign bot
    const { error: rpcErr } = await sb.rpc("assign_bot_to_order", { _order_id: orderId });
    if (rpcErr) console.warn("assign_bot_to_order err", rpcErr);

    return json(200, { ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    console.error("force-paid-order", err);
    return json(500, { error: msg });
  }
});