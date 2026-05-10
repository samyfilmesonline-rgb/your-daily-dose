import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    const source = (url.searchParams.get("source") ?? body.source ?? "").toString();
    const sourceId = (url.searchParams.get("sourceId") ?? body.sourceId ?? "").toString();
    if (!["partner_order", "pix_charge"].includes(source) || !sourceId) {
      return json({ error: "Parâmetros inválidos" }, 400);
    }

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
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Acesso negado" }, 403);

    const { data: events, error } = await sb
      .from("payment_events")
      .select("*")
      .eq("source", source)
      .eq("source_id", sourceId)
      .order("created_at", { ascending: true });
    if (error) return json({ error: error.message }, 500);

    let record: Record<string, unknown> | null = null;
    if (source === "partner_order") {
      const { data } = await sb.from("partner_credit_orders").select("*").eq("id", sourceId).maybeSingle();
      record = data as Record<string, unknown> | null;
    } else {
      const { data } = await sb.from("pix_charges").select("*").eq("id", sourceId).maybeSingle();
      record = data as Record<string, unknown> | null;
    }

    return json({ events: events ?? [], record });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});