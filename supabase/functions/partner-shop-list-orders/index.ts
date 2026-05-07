import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  partnerId: z.string().uuid(),
  fingerprint: z.string().min(8).max(80),
  email: z.string().email().optional(),
});

// Rate limit simples in-memory
const rl = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const cur = rl.get(key);
  if (!cur || cur.resetAt < now) {
    rl.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= max) return false;
  cur.count += 1;
  return true;
}

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
    const { partnerId, fingerprint, email } = parsed.data;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(`${ip}:${fingerprint}`)) {
      return new Response(JSON.stringify({ error: "Muitas requisições" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Match por fingerprint sempre. Se email vier, também aceita.
    const filter = email
      ? `client_fingerprint.eq.${fingerprint},customer_email.eq.${email.toLowerCase()}`
      : `client_fingerprint.eq.${fingerprint}`;

    const { data: orders, error } = await sb
      .from("partner_credit_orders")
      .select(
        "id, status, credits, amount_cents, target_workspace, created_at, paid_at, delivered_at, failed_reason, assigned_bot_id, pix_qrcode, pix_copy_paste, pix_expires_at, tx_id, customer_email, client_fingerprint"
      )
      .eq("partner_id", partnerId)
      .or(filter)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botIds = Array.from(
      new Set((orders ?? []).map((o) => o.assigned_bot_id).filter(Boolean) as string[])
    );
    const botEmailMap: Record<string, string> = {};
    if (botIds.length) {
      const { data: bots } = await sb
        .from("farm_bots")
        .select("id, email_lovable")
        .in("id", botIds);
      for (const b of bots ?? []) botEmailMap[b.id] = b.email_lovable;
    }

    const items = (orders ?? []).map((o) => {
      // Modo reduzido: pedido casou só por email (não bate o fingerprint deste device)
      const ownDevice = o.client_fingerprint === fingerprint;
      return {
        id: o.id,
        status: o.status,
        credits: o.credits,
        amountCents: o.amount_cents,
        targetWorkspace: o.target_workspace,
        createdAt: o.created_at,
        paidAt: o.paid_at,
        deliveredAt: o.delivered_at,
        failedReason: o.failed_reason,
        assignedBotId: o.assigned_bot_id,
        botEmail: o.assigned_bot_id ? botEmailMap[o.assigned_bot_id] ?? null : null,
        // Apenas o próprio device pode ver QR/copia-cola/txId
        pixQrcode: ownDevice ? o.pix_qrcode : null,
        pixCopyPaste: ownDevice ? o.pix_copy_paste : null,
        pixExpiresAt: o.pix_expires_at,
        txId: ownDevice ? o.tx_id : null,
        customerEmail: o.customer_email,
        ownDevice,
      };
    });

    return new Response(JSON.stringify({ orders: items }), {
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