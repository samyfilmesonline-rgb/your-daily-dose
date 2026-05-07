import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { createPixCharge, normalizeQrImage } from "../_shared/abacate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  partnerId: z.string().uuid(),
  packId: z.string().uuid(),
  customerName: z.string().min(2).max(120),
  customerEmail: z.string().email(),
  customerWhatsapp: z.string().max(40).optional(),
  customerTaxId: z.string().min(11).max(20),
  targetWorkspace: z.string().max(200).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const b = parsed.data;
    const taxIdDigits = b.customerTaxId.replace(/\D/g, "");
    if (taxIdDigits.length !== 11 && taxIdDigits.length !== 14) {
      return new Response(JSON.stringify({ error: "CPF/CNPJ inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: pack } = await sb
      .from("partner_credit_packs")
      .select("*")
      .eq("id", b.packId)
      .eq("partner_id", b.partnerId)
      .eq("is_active", true)
      .maybeSingle();
    if (!pack) {
      return new Response(JSON.stringify({ error: "Pacote não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const charge = await createPixCharge({
      amount: pack.price_cents,
      expiresIn: 60 * 30,
      description: `${pack.name} - ${pack.credits} créditos`,
      customer: {
        name: b.customerName,
        email: b.customerEmail.toLowerCase(),
        cellphone: b.customerWhatsapp,
        taxId: taxIdDigits,
      },
    });

    const { data: order, error: insErr } = await sb
      .from("partner_credit_orders")
      .insert({
        partner_id: b.partnerId,
        pack_id: pack.id,
        customer_name: b.customerName,
        customer_email: b.customerEmail.toLowerCase(),
        customer_whatsapp: b.customerWhatsapp ?? null,
        customer_tax_id: taxIdDigits,
        target_workspace: b.targetWorkspace ?? null,
        credits: pack.credits,
        amount_cents: pack.price_cents,
        tx_id: charge.id,
        pix_qrcode: normalizeQrImage(charge.brCodeBase64),
        pix_copy_paste: charge.brCode,
        pix_expires_at: charge.expiresAt ?? null,
        status: "pending",
        raw_payload: charge as unknown as Record<string, unknown>,
      })
      .select("id")
      .single();
    if (insErr || !order) {
      console.error("order insert error", insErr);
      return new Response(JSON.stringify({ error: "Falha ao criar pedido" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        orderId: order.id,
        txId: charge.id,
        qrCodeImage: normalizeQrImage(charge.brCodeBase64),
        copiaECola: charge.brCode,
        amountCents: pack.price_cents,
        expiresAt: charge.expiresAt ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("partner-shop-create-pix error", err);
    const msg = err instanceof Error ? err.message : "Erro";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});