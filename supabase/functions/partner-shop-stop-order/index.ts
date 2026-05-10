import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  orderId: z.string().uuid(),
  fingerprint: z.string().min(8).max(80),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { orderId, fingerprint } = parsed.data;
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Carrega o pedido para decidir se podemos cancelar IMEDIATAMENTE
    // (caso multi-ws ainda não iniciado pelo worker, ou single-ws ainda sem progresso)
    const { data: order } = await sb
      .from("partner_credit_orders")
      .select(
        "id, status, multi_workspace_mode, workspaces_total, workspaces_done, assigned_at, client_fingerprint",
      )
      .eq("id", orderId)
      .maybeSingle();

    if (order && order.client_fingerprint && order.client_fingerprint !== fingerprint) {
      return new Response(JSON.stringify({ error: "Permissão negada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Multi-workspace: apenas marca stop_requested_at. A finalização (status=refunded,
    // refund de créditos, liberação do bot, limpeza de current/target_workspace) é
    // responsabilidade do partner-shop-multi-workspace-tick (quando o worker chamar
    // next/fail) ou do partner-shop-stalled-watchdog (rede de segurança).
    if (order?.multi_workspace_mode === true) {
      if (order.status === "processing" || order.status === "queued" || order.status === "paid") {
        await sb
          .from("partner_credit_orders")
          .update({ stop_requested_at: new Date().toISOString() })
          .eq("id", orderId);
      }
      return new Response(
        JSON.stringify({ ok: true, refundedCredits: 0, immediate: false, multiWorkspace: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Caminho legado: worker ainda está trabalhando, deixa terminar o workspace atual
    const { data: refunded, error } = await sb.rpc("stop_order_partial", {
      _order_id: orderId,
      _fingerprint: fingerprint,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, refundedCredits: refunded ?? 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});