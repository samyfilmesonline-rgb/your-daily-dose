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

      await supabase
        .from("pix_charges")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          license_id: license?.id ?? null,
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