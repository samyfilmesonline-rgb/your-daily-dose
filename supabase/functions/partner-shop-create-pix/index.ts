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
  customerWhatsapp: z.string().min(10).max(40),
  customerTaxId: z.string().min(11).max(20),
  targetWorkspace: z.string().trim().min(2).max(200),
  clientFingerprint: z.string().min(8).max(80).optional(),
  useBalance: z.boolean().optional(),
  balanceToken: z.string().min(16).max(128).optional(),
  balanceFromEmail: z.string().email().optional(),
});

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

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

    const cellphone = b.customerWhatsapp.replace(/\D/g, "");
    if (cellphone.length < 10) {
      return new Response(JSON.stringify({ error: "WhatsApp inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Saldo do cliente
    const useBalance = b.useBalance !== false;
    const customerEmail = b.customerEmail.toLowerCase();
    let availableBalance = 0;
    let crossBalance = 0;
    let crossTokenHash: string | null = null;
    if (b.balanceToken && b.balanceFromEmail) {
      crossTokenHash = await sha256(b.balanceToken);
      const { data: auth } = await sb
        .from("partner_balance_apply_authorizations")
        .select("max_credits, expires_at, used_at, to_email, partner_id, from_email")
        .eq("token_hash", crossTokenHash)
        .maybeSingle();
      if (
        auth &&
        !auth.used_at &&
        new Date(auth.expires_at).getTime() > Date.now() &&
        auth.partner_id === b.partnerId &&
        auth.to_email === customerEmail &&
        auth.from_email === b.balanceFromEmail.toLowerCase()
      ) {
        crossBalance = Math.min(Number(auth.max_credits), pack.credits);
      } else {
        crossTokenHash = null;
      }
    }
    if (useBalance && crossBalance === 0) {
      const { data: bal } = await sb
        .from("partner_customer_balances")
        .select("credits")
        .eq("partner_id", b.partnerId)
        .eq("customer_email", customerEmail)
        .maybeSingle();
      availableBalance = Math.max(0, Number(bal?.credits ?? 0));
    }
    let balanceToApply = crossBalance > 0
      ? crossBalance
      : Math.min(availableBalance, pack.credits);
    let creditsToCharge = pack.credits - balanceToApply;
    const pricePerCredit = pack.price_cents / pack.credits;
    let amountToCharge = Math.round(pricePerCredit * creditsToCharge);
    // AbacatePay exige Pix mínimo de R$ 1,00. Se o valor restante ficaria
    // abaixo, reduzimos o saldo aplicado para manter o Pix em ≥ R$ 1,00.
    const MIN_PIX_CENTS = 100;
    if (amountToCharge > 0 && amountToCharge < MIN_PIX_CENTS && pack.credits > 0) {
      const maxBalanceCents = Math.max(0, pack.price_cents - MIN_PIX_CENTS);
      const maxBalanceCredits = Math.floor(maxBalanceCents / pricePerCredit);
      balanceToApply = Math.max(0, Math.min(balanceToApply, maxBalanceCredits));
      creditsToCharge = pack.credits - balanceToApply;
      amountToCharge = Math.round(pricePerCredit * creditsToCharge);
    }
    const balanceCentsValue = pack.price_cents - amountToCharge;

    // Caso saldo cobre 100% — não precisa de Pix
    if (creditsToCharge === 0 && balanceToApply > 0) {
      const { data: order, error: insErr } = await sb
        .from("partner_credit_orders")
        .insert({
          partner_id: b.partnerId,
          pack_id: pack.id,
          customer_name: b.customerName,
          customer_email: customerEmail,
          customer_whatsapp: b.customerWhatsapp ?? null,
          customer_tax_id: taxIdDigits,
          target_workspace: b.targetWorkspace ?? null,
          client_fingerprint: b.clientFingerprint ?? null,
          credits: pack.credits,
          amount_cents: 0,
          status: "paid",
          paid_at: new Date().toISOString(),
          balance_applied_credits: balanceToApply,
          balance_applied_cents: pack.price_cents,
          raw_payload: crossTokenHash
            ? ({ crossBalance: { fromEmail: b.balanceFromEmail!.toLowerCase(), tokenHash: crossTokenHash } } as Record<string, unknown>)
            : null,
        })
        .select("id")
        .single();
      if (insErr || !order) {
        return new Response(JSON.stringify({ error: insErr?.message ?? "Falha ao criar pedido" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Debita o saldo de fato
      const { data: applied } = crossTokenHash
        ? await sb.rpc("apply_balance_with_token", {
            _partner_id: b.partnerId,
            _order_id: order.id,
            _amount: balanceToApply,
            _token_hash: crossTokenHash,
          })
        : await sb.rpc("apply_balance_to_order", {
            _partner_id: b.partnerId,
            _customer_email: customerEmail,
            _amount: balanceToApply,
            _order_id: order.id,
          });
      if (!applied || Number(applied) === 0) {
        // Saldo sumiu (corrida) — marca como pending sem Pix; cliente precisa repetir
        await sb.from("partner_credit_orders")
          .update({ status: "expired", failed_reason: "Saldo insuficiente no momento da aplicação", balance_applied_credits: 0, balance_applied_cents: 0 })
          .eq("id", order.id);
        return new Response(JSON.stringify({ error: "Saldo já foi usado em outro pedido. Tente novamente." }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await sb.rpc("assign_bot_to_order", { _order_id: order.id });
      return new Response(
        JSON.stringify({
          orderId: order.id,
          paidWithBalance: true,
          balanceAppliedCredits: balanceToApply,
          amountCents: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const charge = await createPixCharge({
      amount: amountToCharge,
      expiresIn: 60 * 30,
      description: balanceToApply > 0
        ? `${pack.name} - ${pack.credits} créditos (${balanceToApply} via saldo)`
        : `${pack.name} - ${pack.credits} créditos`,
      customer: {
        name: b.customerName,
        email: customerEmail,
        taxId: taxIdDigits,
        cellphone,
      },
    });

    const { data: order, error: insErr } = await sb
      .from("partner_credit_orders")
      .insert({
        partner_id: b.partnerId,
        pack_id: pack.id,
        customer_name: b.customerName,
        customer_email: customerEmail,
        customer_whatsapp: b.customerWhatsapp ?? null,
        customer_tax_id: taxIdDigits,
        target_workspace: b.targetWorkspace ?? null,
        client_fingerprint: b.clientFingerprint ?? null,
        credits: pack.credits,
        amount_cents: amountToCharge,
        tx_id: charge.id,
        pix_qrcode: normalizeQrImage(charge.brCodeBase64),
        pix_copy_paste: charge.brCode,
        pix_expires_at: charge.expiresAt ?? null,
        status: "pending",
        balance_applied_credits: balanceToApply,
        balance_applied_cents: balanceCentsValue,
        raw_payload: {
          ...(charge as unknown as Record<string, unknown>),
          ...(crossTokenHash
            ? { crossBalance: { fromEmail: b.balanceFromEmail!.toLowerCase(), tokenHash: crossTokenHash } }
            : {}),
        },
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
        amountCents: amountToCharge,
        balanceAppliedCredits: balanceToApply,
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