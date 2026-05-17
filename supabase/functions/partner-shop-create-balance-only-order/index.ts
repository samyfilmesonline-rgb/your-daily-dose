import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { assertRealWorkspaceName } from "../_shared/workspace-name.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  partnerId: z.string().uuid(),
  customerName: z.string().min(2).max(120),
  customerEmail: z.string().email(),
  customerWhatsapp: z.string().min(10).max(40),
  customerTaxId: z.string().min(11).max(20),
  targetWorkspace: z.string().trim().min(2).max(200),
  clientFingerprint: z.string().min(8).max(80).optional(),
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
    try {
      assertRealWorkspaceName(b.targetWorkspace);
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const taxIdDigits = b.customerTaxId.replace(/\D/g, "");
    if (taxIdDigits.length !== 11 && taxIdDigits.length !== 14) {
      return new Response(JSON.stringify({ error: "CPF/CNPJ inválido" }), {
        status: 400,
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

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const customerEmail = b.customerEmail.toLowerCase();
    const { data: bal } = await sb
      .from("partner_customer_balances")
      .select("credits")
      .eq("partner_id", b.partnerId)
      .eq("customer_email", customerEmail)
      .maybeSingle();
    const available = Math.max(0, Number(bal?.credits ?? 0));
    if (available <= 0) {
      return new Response(JSON.stringify({ error: "Você não tem saldo disponível." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order, error: insErr } = await sb
      .from("partner_credit_orders")
      .insert({
        partner_id: b.partnerId,
        pack_id: null,
        customer_name: b.customerName,
        customer_email: customerEmail,
        customer_whatsapp: b.customerWhatsapp ?? null,
        customer_tax_id: taxIdDigits,
        target_workspace: b.targetWorkspace,
        client_fingerprint: b.clientFingerprint ?? null,
        credits: available,
        amount_cents: 0,
        status: "paid",
        paid_at: new Date().toISOString(),
        balance_applied_credits: available,
        balance_applied_cents: 0,
      })
      .select("id")
      .single();
    if (insErr || !order) {
      return new Response(JSON.stringify({ error: insErr?.message ?? "Falha ao criar pedido" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: applied } = await sb.rpc("apply_balance_to_order", {
      _partner_id: b.partnerId,
      _customer_email: customerEmail,
      _amount: available,
      _order_id: order.id,
    });
    if (!applied || Number(applied) === 0) {
      await sb.from("partner_credit_orders")
        .update({
          status: "expired",
          failed_reason: "Saldo insuficiente no momento da aplicação",
          balance_applied_credits: 0,
          balance_applied_cents: 0,
        })
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
        credits: available,
        balanceAppliedCredits: available,
        amountCents: 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("partner-shop-create-balance-only-order error", err);
    const msg = err instanceof Error ? err.message : "Erro";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});