import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

const EventTypes = [
  "billing_plan_checked",
  "workspace_selected",
  "captcha_required",
  "credits_farmed",
  "order_finished",
  "billing_upgrade_attempted",
  "billing_downgrade_corrected",
] as const;

const Body = z.object({
  orderId: z.string().uuid().nullable().optional(),
  botId: z.string().uuid().nullable().optional(),
  partnerId: z.string().uuid(),
  eventType: z.enum(EventTypes),
  severity: z.enum(["info", "warn", "action_required"]).optional(),
  message: z.string().max(500).optional(),
  payload: z.record(z.unknown()).optional(),
});

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d{13,19}\b/g, "••••"],
  [/sk_(live|test)_[A-Za-z0-9]+/g, "••••"],
  [/pk_(live|test)_[A-Za-z0-9]+/g, "••••"],
  [/rk_(live|test)_[A-Za-z0-9]+/g, "••••"],
  [/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "••••"],
  [/service_role[^\s"']*/gi, "••••"],
  [/https?:\/\/(checkout\.)?stripe\.com\/[^\s"']+/g, "••••"],
];

const FORBIDDEN_KEYS = new Set([
  "card", "card_number", "cardnumber", "cvc", "cvv", "ccv",
  "service_role_key", "service_role", "password", "senha",
  "stripe_secret", "secret", "token", "access_token", "api_key", "apikey",
]);

function sanitize(value: unknown): unknown {
  if (typeof value === "string") {
    let v = value;
    for (const [re, rep] of SECRET_PATTERNS) v = v.replace(re, rep);
    return v;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) {
        out[k] = "••••";
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const expected = Deno.env.get("WORKER_SHARED_SECRET");
    const provided = req.headers.get("x-worker-secret") ?? "";
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = parsed.data;
    const cleanPayload = sanitize(body.payload ?? {}) as Record<string, unknown>;
    const cleanMessage = body.message ? (sanitize(body.message) as string) : null;

    let severity = body.severity;
    if (!severity) {
      severity = body.eventType === "captcha_required" ? "action_required" : "info";
    }

    const { error } = await sb.from("worker_events").insert({
      order_id: body.orderId ?? null,
      bot_id: body.botId ?? null,
      partner_id: body.partnerId,
      event_type: body.eventType,
      severity,
      message: cleanMessage,
      payload: cleanPayload,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});