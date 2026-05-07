import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-signature",
};

/**
 * Webhook AbacatePay. Configurar URL no painel da Abacate apontando para:
 *   https://<project-ref>.supabase.co/functions/v1/abacatepay-webhook
 *
 * Idempotente por tx_id.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Signature / shared-secret verification ---
    // AbacatePay sends the webhook secret as a `webhookSecret` query param
    // (per their docs). We also accept it via `x-webhook-signature` header
    // for flexibility. Reject any request that doesn't match.
    const expectedSecret = Deno.env.get("ABACATEPAY_WEBHOOK_SECRET");
    if (!expectedSecret) {
      console.error("ABACATEPAY_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const providedSecret =
      url.searchParams.get("webhookSecret") ??
      req.headers.get("x-webhook-signature") ??
      "";

    // Constant-time comparison to avoid timing attacks
    const enc = new TextEncoder();
    const a = enc.encode(providedSecret);
    const b = enc.encode(expectedSecret);
    let equal = a.length === b.length;
    const len = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < len; i++) {
      diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    }
    equal = equal && diff === 0;

    if (!equal) {
      console.warn("abacate webhook: invalid signature/secret");
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json().catch(() => ({}));
    console.log("abacate webhook payload", payload);

    // Extrai id e status (formato pode variar — cobrimos os casos comuns)
    const data = payload?.data ?? payload ?? {};
    const txId: string | undefined = data?.id ?? data?.pixQrCode?.id ?? data?.charge?.id;
    const status: string = String(
      data?.status ?? data?.pixQrCode?.status ?? data?.event ?? ""
    ).toUpperCase();

    if (!txId) {
      return new Response(JSON.stringify({ error: "txId ausente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: charge } = await supabase
      .from("pix_charges")
      .select("*, credit_packs(*)")
      .eq("tx_id", txId)
      .maybeSingle();
    if (!charge) {
      // Tenta achar como pedido de loja por parceiro
      const { data: order } = await supabase
        .from("partner_credit_orders")
        .select("id, status")
        .eq("tx_id", txId)
        .maybeSingle();
      if (order) {
        const isPaid =
          status === "PAID" ||
          status === "BILLING.PAID" ||
          status === "PIXQRCODE.PAID";
        if (isPaid) {
          if (order.status === "pending") {
            // Busca dados completos para aplicar saldo se necessário
            const { data: fullOrder } = await supabase
              .from("partner_credit_orders")
              .select("partner_id, customer_email, balance_applied_credits")
              .eq("id", order.id)
              .maybeSingle();
            await supabase
              .from("partner_credit_orders")
              .update({
                status: "paid",
                paid_at: new Date().toISOString(),
                raw_payload: payload as unknown as Record<string, unknown>,
              })
              .eq("id", order.id);
            if (fullOrder && Number(fullOrder.balance_applied_credits) > 0) {
              const { data: applied } = await supabase.rpc("apply_balance_to_order", {
                _partner_id: fullOrder.partner_id,
                _customer_email: fullOrder.customer_email,
                _amount: Number(fullOrder.balance_applied_credits),
                _order_id: order.id,
              });
              if (!applied || Number(applied) === 0) {
                // Saldo evaporou — zera o registro mas mantém o pedido
                await supabase
                  .from("partner_credit_orders")
                  .update({ balance_applied_credits: 0, balance_applied_cents: 0 })
                  .eq("id", order.id);
              }
            }
          }
          // Tenta atribuir bot — idempotente p/ paid/queued sem bot.
          if (["pending", "paid", "queued"].includes(order.status)) {
            const { data: botId, error: rpcErr } = await supabase.rpc(
              "assign_bot_to_order",
              { _order_id: order.id }
            );
            console.log("webhook assign result", { orderId: order.id, botId, rpcErr });
          }
        }
        return new Response(JSON.stringify({ ok: true, kind: "partner_order" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isPaid =
      status === "PAID" ||
      status === "BILLING.PAID" ||
      status === "PIXQRCODE.PAID";

    if (isPaid && charge.status !== "paid") {
      const pack = charge.credit_packs as { name: string; credits: number };
      let licenseId: string | null = null;

      if ((charge as { partner_user_id?: string | null }).partner_user_id) {
        const partnerId = (charge as { partner_user_id: string }).partner_user_id;
        const { data: parc } = await supabase
          .from("parceiros")
          .select("limite_creditos")
          .eq("user_id", partnerId)
          .maybeSingle();
        const novoLimite = Number(parc?.limite_creditos ?? 0) + Number(pack.credits);
        await supabase
          .from("parceiros")
          .update({ limite_creditos: novoLimite })
          .eq("user_id", partnerId);
      } else {
        const { data: license } = await supabase
          .from("app_licenses")
          .insert({
            customer_email: charge.customer_email,
            customer_name: charge.customer_name,
            plan_code: `credits_${pack.credits}`,
            plan_name: `${pack.name} - ${pack.credits} créditos`,
            max_machines: 1,
            status: "active",
            notes: `Pagamento Pix Abacate ${txId} (webhook)`,
          })
          .select()
          .single();
        licenseId = license?.id ?? null;
      }

      const activationToken = !(charge as { partner_user_id?: string | null }).partner_user_id
        ? ((charge as { activation_token?: string | null }).activation_token ?? crypto.randomUUID().replace(/-/g, ""))
        : null;

      await supabase
        .from("pix_charges")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          license_id: licenseId,
          activation_token: activationToken,
          raw_payload: payload as unknown as Record<string, unknown>,
        })
        .eq("tx_id", txId);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("webhook error", err);
    const msg = err instanceof Error ? err.message : "erro";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});