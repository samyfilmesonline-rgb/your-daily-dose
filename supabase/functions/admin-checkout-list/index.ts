import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Source = "all" | "partner" | "pix";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const params = { ...Object.fromEntries(url.searchParams), ...body } as Record<string, any>;

    const source = (params.source ?? "all") as Source;
    const status = (params.status ?? "all") as string;
    const q = (params.q ?? "").toString().trim().toLowerCase();
    const from = params.from ? new Date(params.from).toISOString() : null;
    const to = params.to ? new Date(params.to).toISOString() : null;
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(5, Number(params.pageSize ?? 25)));

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Não autenticado" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roleRow } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Acesso negado" }, 403);

    type Row = {
      id: string;
      source: "partner_order" | "pix_charge";
      status: string;
      customer_name: string | null;
      customer_email: string | null;
      customer_whatsapp: string | null;
      partner_id: string | null;
      partner_name: string | null;
      amount_cents: number | null;
      credits: number | null;
      created_at: string;
      paid_at: string | null;
      pix_expires_at: string | null;
      tx_id: string | null;
      raw: Record<string, unknown>;
    };

    const rows: Row[] = [];

    const applyCommonFilters = (qb: any) => {
      if (from) qb = qb.gte("created_at", from);
      if (to) qb = qb.lte("created_at", to);
      if (q) {
        const like = `%${q}%`;
        qb = qb.or(
          `customer_email.ilike.${like},customer_name.ilike.${like},customer_whatsapp.ilike.${like}`,
        );
      }
      return qb;
    };

    if (source === "all" || source === "partner") {
      let qb = sb
        .from("partner_credit_orders")
        .select(
          "id, status, customer_name, customer_email, customer_whatsapp, partner_id, amount_cents, credits, created_at, paid_at, pix_expires_at, tx_id, target_workspace, is_manual, failed_reason, delivered_at, refunded_credits, balance_applied_credits",
        );
      qb = applyCommonFilters(qb);
      if (status !== "all") qb = qb.eq("status", status);
      const { data, error } = await qb.order("created_at", { ascending: false }).limit(500);
      if (error) return json({ error: error.message }, 500);
      for (const o of data ?? []) {
        rows.push({
          id: o.id,
          source: "partner_order",
          status: o.status,
          customer_name: o.customer_name,
          customer_email: o.customer_email,
          customer_whatsapp: o.customer_whatsapp,
          partner_id: o.partner_id,
          partner_name: null,
          amount_cents: o.amount_cents,
          credits: o.credits,
          created_at: o.created_at,
          paid_at: o.paid_at,
          pix_expires_at: o.pix_expires_at,
          tx_id: o.tx_id,
          raw: o as Record<string, unknown>,
        });
      }
    }

    if (source === "all" || source === "pix") {
      let qb = sb
        .from("pix_charges")
        .select(
          "id, status, customer_name, customer_email, customer_whatsapp, partner_user_id, amount_cents, created_at, paid_at, tx_id, pack_id, license_id, activation_token",
        );
      qb = applyCommonFilters(qb);
      if (status !== "all") qb = qb.eq("status", status);
      const { data, error } = await qb.order("created_at", { ascending: false }).limit(500);
      if (error) return json({ error: error.message }, 500);
      for (const o of data ?? []) {
        rows.push({
          id: o.id,
          source: "pix_charge",
          status: o.status,
          customer_name: o.customer_name,
          customer_email: o.customer_email,
          customer_whatsapp: o.customer_whatsapp,
          partner_id: o.partner_user_id,
          partner_name: null,
          amount_cents: o.amount_cents,
          credits: null,
          created_at: o.created_at,
          paid_at: o.paid_at,
          pix_expires_at: null,
          tx_id: o.tx_id,
          raw: o as Record<string, unknown>,
        });
      }
    }

    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    // Resolve nomes de parceiros
    const partnerIds = Array.from(new Set(rows.map((r) => r.partner_id).filter(Boolean) as string[]));
    if (partnerIds.length) {
      const { data: partners } = await sb
        .from("parceiros")
        .select("user_id, nome")
        .in("user_id", partnerIds);
      const map = new Map((partners ?? []).map((p) => [p.user_id, p.nome] as const));
      for (const r of rows) {
        if (r.partner_id) r.partner_name = map.get(r.partner_id) ?? null;
      }
    }

    // Totais agregados (sobre o resultado filtrado, antes da paginação)
    const totals = {
      count: rows.length,
      grossCents: rows.reduce((a, r) => a + (r.amount_cents ?? 0), 0),
      paidCents: rows
        .filter((r) => ["paid", "delivered", "processing", "queued", "refunded"].includes(r.status))
        .reduce((a, r) => a + (r.amount_cents ?? 0), 0),
      pendingCents: rows
        .filter((r) => ["pending", "pix_generated"].includes(r.status))
        .reduce((a, r) => a + (r.amount_cents ?? 0), 0),
      failedCount: rows.filter((r) => ["failed", "canceled", "expired"].includes(r.status)).length,
    };

    const start = (page - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);

    return json({ items, totals, page, pageSize, total: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});