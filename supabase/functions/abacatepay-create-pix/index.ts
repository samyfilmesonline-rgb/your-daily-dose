import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  createPixCharge,
  normalizeQrImage,
} from "../_shared/abacate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  packId: z.string().min(1),
  customerName: z.string().min(2).max(120),
  customerEmail: z.string().email(),
  customerWhatsapp: z.string().max(40).optional(),
});

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
    const { packId, customerName, customerEmail, customerWhatsapp } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: pack, error: packErr } = await supabase
      .from("credit_packs")
      .select("*")
      .eq("id", packId)
      .eq("is_active", true)
      .maybeSingle();

    if (packErr || !pack) {
      return new Response(
        JSON.stringify({ error: "Pacote não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const charge = await createPixCharge({
      amount: pack.price_cents,
      expiresIn: 60 * 30, // 30 minutos
      description: `${pack.name} - ${pack.credits} créditos Lovable`,
      customer: {
        name: customerName,
        email: customerEmail.toLowerCase(),
        cellphone: customerWhatsapp,
      },
    });

    const { error: insErr } = await supabase.from("pix_charges").insert({
      tx_id: charge.id,
      pack_id: pack.id,
      customer_name: customerName,
      customer_email: customerEmail.toLowerCase(),
      customer_whatsapp: customerWhatsapp,
      amount_cents: pack.price_cents,
      status: "pending",
      raw_payload: charge as unknown as Record<string, unknown>,
    });
    if (insErr) {
      console.error("pix_charges insert error", insErr);
    }

    return new Response(
      JSON.stringify({
        txId: charge.id,
        qrCodeImage: normalizeQrImage(charge.brCodeBase64),
        copiaECola: charge.brCode,
        amountCents: pack.price_cents,
        expiresAt: charge.expiresAt ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-pix error", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});