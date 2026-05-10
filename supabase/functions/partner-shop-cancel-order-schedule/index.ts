import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  scheduleId: z.string().uuid(),
  action: z.enum(["cancel", "pause", "resume"]).default("cancel"),
});

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");

    const callerClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) return json(401, { error: "Unauthorized" });
    const callerId = userData.user.id;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: "Parâmetros inválidos" });
    const { scheduleId, action } = parsed.data;

    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: isAdminRpc } = await sb.rpc("has_role", { _user_id: callerId, _role: "admin" });
    const isAdmin = !!isAdminRpc;

    const { data: sched } = await sb
      .from("partner_order_schedules")
      .select("id, partner_id, status")
      .eq("id", scheduleId)
      .maybeSingle();
    if (!sched) return json(404, { error: "Programação não encontrada" });
    if (!isAdmin && sched.partner_id !== callerId) return json(403, { error: "Sem permissão" });

    let newStatus: string;
    if (action === "cancel") newStatus = "canceled";
    else if (action === "pause") newStatus = "paused";
    else newStatus = "active";

    const { error: updErr } = await sb
      .from("partner_order_schedules")
      .update({ status: newStatus })
      .eq("id", scheduleId);
    if (updErr) return json(500, { error: updErr.message });

    return json(200, { ok: true, status: newStatus });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    console.error("cancel-order-schedule", err);
    return json(500, { error: msg });
  }
});