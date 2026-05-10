import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Schedule = {
  id: string;
  partner_id: string;
  bot_id: string;
  customer_name: string;
  customer_email: string;
  customer_whatsapp: string | null;
  notes: string | null;
  price_cents_per_workspace: number;
  start_at: string;
  end_mode: "days" | "until_date";
  total_days: number | null;
  end_at: string | null;
  status: "active" | "paused" | "completed" | "canceled";
  next_run_at: string;
  runs_completed: number;
  runs_failed: number;
};

async function processSchedule(sb: SupabaseClient, s: Schedule): Promise<{ action: string; orderId?: string; error?: string }> {
  const now = new Date();
  const totalRuns = s.runs_completed + s.runs_failed;

  // Já passou da data de término?
  if (s.end_mode === "until_date" && s.end_at && new Date(s.end_at) <= now) {
    await sb.from("partner_order_schedules").update({ status: "completed" }).eq("id", s.id);
    return { action: "completed_by_date" };
  }
  if (s.end_mode === "days" && s.total_days && totalRuns >= s.total_days) {
    await sb.from("partner_order_schedules").update({ status: "completed" }).eq("id", s.id);
    return { action: "completed_by_days" };
  }

  // Cria pedido multi-ws
  const runIndex = totalRuns + 1;
  const nowIso = now.toISOString();
  const { data: created, error: insErr } = await sb
    .from("partner_credit_orders")
    .insert({
      partner_id: s.partner_id,
      pack_id: null,
      customer_name: s.customer_name,
      customer_email: s.customer_email,
      customer_whatsapp: s.customer_whatsapp,
      status: "paid",
      is_manual: true,
      paid_at: nowIso,
      bot_invite_confirmed_at: nowIso,
      bot_invite_confirmed_fingerprint: "scheduled",
      tx_id: `schedule:${s.id}:${runIndex}`,
      target_workspace: null,
      credits: 0,
      amount_cents: 0,
      multi_workspace_mode: true,
      price_cents_per_workspace: s.price_cents_per_workspace,
      schedule_id: s.id,
      schedule_run_index: runIndex,
      raw_payload: {
        scheduledOrder: { scheduleId: s.id, runIndex, notes: s.notes, at: nowIso },
      },
    })
    .select("id")
    .single();

  if (insErr || !created) {
    await sb
      .from("partner_order_schedules")
      .update({
        runs_failed: s.runs_failed + 1,
        last_run_at: nowIso,
        next_run_at: addDays(s.next_run_at, 1),
      })
      .eq("id", s.id);
    return { action: "insert_failed", error: insErr?.message };
  }

  const orderId = created.id as string;

  // Tenta atribuir bot específico (idle => processing). Se ocupado => queued.
  const { data: botRow } = await sb
    .from("farm_bots")
    .select("id, status")
    .eq("id", s.bot_id)
    .maybeSingle();

  if (botRow?.status === "idle") {
    const { data: claimed } = await sb
      .from("farm_bots")
      .update({ status: "busy", current_order_id: orderId })
      .eq("id", s.bot_id)
      .eq("status", "idle")
      .select("id")
      .maybeSingle();
    if (claimed) {
      await sb
        .from("partner_credit_orders")
        .update({ status: "processing", assigned_bot_id: s.bot_id, assigned_at: nowIso })
        .eq("id", orderId);
    } else {
      await sb.from("partner_credit_orders").update({ status: "queued" }).eq("id", orderId);
    }
  } else {
    await sb.from("partner_credit_orders").update({ status: "queued" }).eq("id", orderId);
  }

  // Avança schedule
  await sb
    .from("partner_order_schedules")
    .update({
      runs_completed: s.runs_completed + 1,
      last_run_at: nowIso,
      next_run_at: addDays(s.next_run_at, 1),
    })
    .eq("id", s.id);

  return { action: "spawned", orderId };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

    let scheduleId: string | null = null;
    try {
      const body = req.method === "POST" ? await req.json() : null;
      scheduleId = body?.scheduleId ?? null;
    } catch { /* sem body é ok (cron) */ }

    const nowIso = new Date().toISOString();
    let query = sb
      .from("partner_order_schedules")
      .select(
        "id, partner_id, bot_id, customer_name, customer_email, customer_whatsapp, notes, price_cents_per_workspace, start_at, end_mode, total_days, end_at, status, next_run_at, runs_completed, runs_failed",
      )
      .eq("status", "active");
    if (scheduleId) query = query.eq("id", scheduleId);
    else query = query.lte("next_run_at", nowIso).limit(50);

    const { data: schedules, error: selErr } = await query;
    if (selErr) return json(500, { error: selErr.message });

    const results: Array<{ scheduleId: string; result: { action: string; orderId?: string; error?: string } }> = [];
    for (const s of (schedules ?? []) as Schedule[]) {
      // Re-checa next_run_at se veio por scheduleId (start imediato)
      if (scheduleId && new Date(s.next_run_at) > new Date()) {
        results.push({ scheduleId: s.id, result: { action: "not_due_yet" } });
        continue;
      }
      const r = await processSchedule(sb, s);
      results.push({ scheduleId: s.id, result: r });
    }

    return json(200, { ok: true, processed: results.length, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    console.error("schedule-tick", err);
    return json(500, { error: msg });
  }
});