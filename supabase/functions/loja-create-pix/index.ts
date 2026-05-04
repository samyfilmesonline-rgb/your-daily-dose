import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { createPixCharge, normalizeQrImage } from "../_shared/abacate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  packId: z.string().min(1),
  customerName: z.string().min(2).max(120).optional(),
  customerWhatsapp: z.string().max(40).optional(),
  customerTaxId: z.string().min(11).max(20),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Usuário inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { packId, customerName, customerWhatsapp, customerTaxId } = parsed.data;
    const taxIdDigits = customerTaxId.replace(/\D/g, "");
    if (taxIdDigits.length !== 11 && taxIdDigits.length !== 14) {
      return new Response(
        JSON.stringify({ error: "CPF/CNPJ inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: parceiro } = await supabase
      .from("parceiros")
      .select("user_id, nome, whatsapp")
      .eq("user_id", user.id)
      .maybeSingle();

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

    const buyerName = customerName?.trim() || parceiro?.nome || user.email?.split("@")[0] || "Cliente";
    const buyerWhatsapp = customerWhatsapp?.trim() || parceiro?.whatsapp || undefined;
    const buyerEmail = (user.email ?? "").toLowerCase();

    const charge = await createPixCharge({
      amount: pack.price_cents,
      expiresIn: 60 * 30,
      description: `Loja interna · ${pack.name} (${pack.credits} créditos)`,
      customer: {
        name: buyerName,
        email: buyerEmail,
        cellphone: buyerWhatsapp,
        taxId: taxIdDigits,
      },
    });

    const { error: insErr } = await supabase.from("pix_charges").insert({
      tx_id: charge.id,
      pack_id: pack.id,
      customer_name: buyerName,
      customer_email: buyerEmail,
      customer_whatsapp: buyerWhatsapp,
      amount_cents: pack.price_cents,
      status: "pending",
      partner_user_id: user.id,
      raw_payload: charge as unknown as Record<string, unknown>,
    });
    if (insErr) console.error("pix_charges insert error", insErr);

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
    console.error("loja-create-pix error", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});