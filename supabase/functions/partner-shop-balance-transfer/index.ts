import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("lookup"),
    partnerId: z.string().uuid(),
    fromEmail: z.string().email(),
    fingerprint: z.string().min(8).max(80),
  }),
  z.object({
    action: z.literal("transfer"),
    partnerId: z.string().uuid(),
    fromEmail: z.string().email(),
    toEmail: z.string().email(),
    fingerprint: z.string().min(8).max(80),
  }),
  z.object({
    action: z.literal("authorize_apply"),
    partnerId: z.string().uuid(),
    fromEmail: z.string().email(),
    toEmail: z.string().email(),
    fingerprint: z.string().min(8).max(80),
    maxCredits: z.number().int().positive(),
  }),
]);

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
    const b = parsed.data;
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (b.action === "lookup") {
      const { data, error } = await sb.rpc("lookup_balance_by_email", {
        _partner_id: b.partnerId,
        _from_email: b.fromEmail,
        _fingerprint: b.fingerprint,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const row = Array.isArray(data) ? data[0] : data;
      return new Response(
        JSON.stringify({
          credits: Number(row?.credits ?? 0),
          fingerprintMatch: !!row?.fingerprint_match,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (b.action === "transfer") {
      const { data, error } = await sb.rpc("transfer_balance_between_emails", {
        _partner_id: b.partnerId,
        _from_email: b.fromEmail,
        _to_email: b.toEmail,
        _fingerprint: b.fingerprint,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ transferred: Number(data ?? 0) }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // authorize_apply
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const tokenHash = await sha256(token);
    const { error } = await sb.rpc("create_balance_apply_authorization", {
      _partner_id: b.partnerId,
      _from_email: b.fromEmail,
      _to_email: b.toEmail,
      _fingerprint: b.fingerprint,
      _max_credits: b.maxCredits,
      _token_hash: tokenHash,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        token,
        expiresInSec: 15 * 60,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});