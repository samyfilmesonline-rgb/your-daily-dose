import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkPixStatus } from "../_shared/abacate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({ txId: z.string().min(1) });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { txId } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: charge, error: chErr } = await supabase
      .from("pix_charges")
      .select("*, credit_packs(*)")
      .eq("tx_id", txId)
      .maybeSingle();
    if (chErr || !charge) {
      return new Response(
        JSON.stringify({ error: "Cobrança não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Já paga: retorna direto.
    if (charge.status === "paid") {
      return new Response(
        JSON.stringify({
          status: "paid",
          licenseCreated: !!charge.license_id,
          activationToken: charge.activation_token ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const remote = await checkPixStatus(txId);
    const remoteStatus = (remote.status || "").toUpperCase();

    if (remoteStatus === "PAID") {
      const pack = charge.credit_packs as { id: string; name: string; credits: number };
      let licenseId: string | null = null;

      if (charge.partner_user_id) {
        // Compra interna: incrementa o limite de crédito do parceiro
        const { data: parc } = await supabase
          .from("parceiros")
          .select("limite_creditos")
          .eq("user_id", charge.partner_user_id)
          .maybeSingle();
        const novoLimite = Number(parc?.limite_creditos ?? 0) + Number(pack.credits);
        await supabase
          .from("parceiros")
          .update({ limite_creditos: novoLimite })
          .eq("user_id", charge.partner_user_id);
      } else {
        // Fluxo público /vendas: cria licença vinculada ao email
        const { data: license, error: licErr } = await supabase
          .from("app_licenses")
          .insert({
            customer_email: charge.customer_email,
            customer_name: charge.customer_name,
            plan_code: `credits_${pack.credits}`,
            plan_name: `${pack.name} - ${pack.credits} créditos`,
            max_machines: 1,
            status: "active",
            notes: `Pagamento Pix Abacate ${txId}`,
          })
          .select()
          .single();
        if (licErr) console.error("license insert error", licErr);
        licenseId = license?.id ?? null;
      }

      // Gera activation_token apenas para fluxo público (sem partner_user_id)
      const activationToken = !charge.partner_user_id
        ? (charge.activation_token ?? crypto.randomUUID().replace(/-/g, ""))
        : null;

      await supabase
        .from("pix_charges")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          license_id: licenseId,
          activation_token: activationToken,
          raw_payload: remote as unknown as Record<string, unknown>,
        })
        .eq("tx_id", txId);

      return new Response(
        JSON.stringify({
          status: "paid",
          licenseCreated: !!licenseId,
          creditsAdded: charge.partner_user_id ? pack.credits : 0,
          activationToken,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (remoteStatus === "EXPIRED" || remoteStatus === "CANCELLED") {
      await supabase.from("pix_charges").update({ status: "expired" }).eq("tx_id", txId);
      return new Response(
        JSON.stringify({ status: "expired", licenseCreated: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ status: "pending", licenseCreated: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-status error", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});