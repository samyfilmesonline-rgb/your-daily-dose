import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Body = z.object({
  partnerId: z.string().uuid(),
  bots: z
    .array(
      z.object({
        email: z.string().email(),
        password: z.string().min(1).max(200),
        nickname: z.string().max(80).optional(),
      })
    )
    .min(1)
    .max(200),
});

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

  const callerClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims } = await callerClient.auth.getClaims(token);
  if (!claims?.claims) return json(401, { error: "Unauthorized" });
  const callerId = claims.claims.sub as string;

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: callerId,
    _role: "admin",
  });
  if (!isAdmin) return json(403, { error: "Apenas admins" });

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return json(400, { error: "Body inválido", details: String(e) });
  }

  const results: Array<{ email: string; ok: boolean; error?: string }> = [];
  for (const b of parsed.bots) {
    const email = b.email.toLowerCase().trim();
    const { error } = await admin.from("farm_bots").insert({
      partner_id: parsed.partnerId,
      email_lovable: email,
      senha_lovable: b.password,
      nickname: b.nickname ?? null,
    });
    if (error) {
      results.push({ email, ok: false, error: error.message });
    } else {
      results.push({ email, ok: true });
    }
  }

  return json(200, {
    inserted: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});