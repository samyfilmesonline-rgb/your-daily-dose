import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { assertRealWorkspaceName } from "../_shared/workspace-name.ts";
import { PER_WORKSPACE_DAILY_CAP, getWorkspaceCooldownUntil, createCooldownSchedule } from "../_shared/limits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  partnerId: z.string().uuid(),
  customerEmail: z.string().email(),
  clientFingerprint: z.string().min(8).max(80),
  targetWorkspace: z.string().trim().min(2).max(200),
  credits: z.number().int().min(1).max(100000),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerWhatsapp: z.string().min(0).max(40).optional(),
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
    const customerEmail = b.customerEmail.toLowerCase();

    if (b.credits > PER_WORKSPACE_DAILY_CAP) {
      return new Response(JSON.stringify({
        error: `Cada workspace só aceita até ${PER_WORKSPACE_DAILY_CAP} créditos a cada 24h.`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Cooldown 20/24h por workspace — agenda em vez de processar.
    {
      const cd = await getWorkspaceCooldownUntil(sb, b.targetWorkspace);
      if (cd) {
        try {
          const scheduleId = await createCooldownSchedule(sb, {
            partnerId: b.partnerId,
            customerName: b.customerName ?? customerEmail,
            customerEmail,
            customerWhatsapp: b.customerWhatsapp,
            targetWorkspace: b.targetWorkspace,
            credits: b.credits,
            amountCentsPerRun: 0,
            scheduledFor: cd,
            notes: `cooldown 20/24h — uso de saldo reagendado para ${customerEmail}`,
          });
          return new Response(JSON.stringify({
            scheduled: true, scheduleId, scheduledFor: cd,
            message: "Workspace em cooldown — pedido agendado.",
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e) {
          console.error("schedule on cooldown err", e);
        }
      }
    }

    const { data: bal } = await sb
      .from("partner_customer_balances")
      .select("credits, client_fingerprint")
      .eq("partner_id", b.partnerId)
      .eq("customer_email", customerEmail)
      .maybeSingle();

    if (!bal || Number(bal.credits) <= 0) {
      return new Response(JSON.stringify({ error: "Sem saldo disponível" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!bal.client_fingerprint || bal.client_fingerprint !== b.clientFingerprint) {
      return new Response(JSON.stringify({ error: "Dispositivo não autorizado para este saldo" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (b.credits > Number(bal.credits)) {
      return new Response(JSON.stringify({ error: "Quantidade maior que o saldo disponível" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order, error: insErr } = await sb
      .from("partner_credit_orders")
      .insert({
        partner_id: b.partnerId,
        pack_id: null,
        customer_name: b.customerName ?? customerEmail,
        customer_email: customerEmail,
        customer_whatsapp: b.customerWhatsapp ?? null,
        customer_tax_id: null,
        target_workspace: b.targetWorkspace,
        client_fingerprint: b.clientFingerprint,
        credits: b.credits,
        amount_cents: 0,
        status: "paid",
        paid_at: new Date().toISOString(),
        balance_applied_credits: b.credits,
        balance_applied_cents: 0,
        raw_payload: { source: "redeem_balance" } as Record<string, unknown>,
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
      _amount: b.credits,
      _order_id: order.id,
    });
    if (!applied || Number(applied) === 0) {
      await sb.from("partner_credit_orders")
        .update({ status: "expired", failed_reason: "Saldo insuficiente no momento da aplicação", balance_applied_credits: 0 })
        .eq("id", order.id);
      return new Response(JSON.stringify({ error: "Saldo já foi usado em outro pedido. Tente novamente." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sb.rpc("assign_bot_to_order", { _order_id: order.id });

    return new Response(
      JSON.stringify({ orderId: order.id, creditsRedeemed: b.credits }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("partner-shop-redeem-balance error", err);
    const msg = err instanceof Error ? err.message : "Erro";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});