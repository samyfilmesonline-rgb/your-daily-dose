import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  partnerId: z.string().uuid().optional(),
  botId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(200),
  customerEmail: z.string().trim().email().max(255),
  customerWhatsapp: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().min(3).max(500),
  pricePerWorkspaceCents: z.number().int().min(1).max(100_000_00),
  endMode: z.enum(["days", "until_date"]),
  totalDays: z.number().int().min(1).max(365).optional(),
  endAt: z.string().datetime().optional(),
}).superRefine((v, ctx) => {
  if (v.endMode === "days" && !v.totalDays) {
    ctx.addIssue({ code: "custom", message: "totalDays obrigatório", path: ["totalDays"] });
  }
  if (v.endMode === "until_date" && !v.endAt) {
    ctx.addIssue({ code: "custom", message: "endAt obrigatório", path: ["endAt"] });
  }
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
    if (!parsed.success) {
      return json(400, { error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const b = parsed.data;

    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: isAdminRpc } = await sb.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    const isAdmin = !!isAdminRpc;

    const partnerId = b.partnerId ?? callerId;
    if (!isAdmin && partnerId !== callerId) {
      return json(403, { error: "Sem permissão" });
    }

    if (!isAdmin) {
      const { data: partnerRow } = await sb
        .from("parceiros")
        .select("status")
        .eq("user_id", callerId)
        .maybeSingle();
      if (!partnerRow || String(partnerRow.status).toLowerCase() !== "ativo") {
        return json(403, { error: "Parceiro inativo" });
      }
    }

    const { data: bot } = await sb
      .from("farm_bots")
      .select("id, partner_id")
      .eq("id", b.botId)
      .maybeSingle();
    if (!bot) return json(404, { error: "Bot não encontrado" });
    if (bot.partner_id !== partnerId) return json(403, { error: "Bot não pertence ao parceiro" });

    const startAt = new Date();
    const endAt = b.endMode === "until_date" ? new Date(b.endAt!) : null;
    if (endAt && endAt <= startAt) {
      return json(400, { error: "Data de término precisa estar no futuro" });
    }

    const { data: created, error: insErr } = await sb
      .from("partner_order_schedules")
      .insert({
        partner_id: partnerId,
        bot_id: b.botId,
        created_by: callerId,
        customer_name: b.customerName,
        customer_email: b.customerEmail.toLowerCase(),
        customer_whatsapp: b.customerWhatsapp ?? null,
        notes: b.notes,
        workspaces: [],
        price_cents_per_workspace: b.pricePerWorkspaceCents,
        start_at: startAt.toISOString(),
        end_mode: b.endMode,
        total_days: b.endMode === "days" ? b.totalDays : null,
        end_at: endAt ? endAt.toISOString() : null,
        status: "active",
        next_run_at: startAt.toISOString(),
      })
      .select("id")
      .single();
    if (insErr || !created) return json(500, { error: insErr?.message ?? "Falha ao criar" });

    // Dispara primeiro tick imediatamente
    try {
      await sb.functions.invoke("partner-shop-schedule-tick", { body: { scheduleId: created.id } });
    } catch (e) {
      console.warn("first tick err", e);
    }

    return json(200, { ok: true, scheduleId: created.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    console.error("create-order-schedule", err);
    return json(500, { error: msg });
  }
});