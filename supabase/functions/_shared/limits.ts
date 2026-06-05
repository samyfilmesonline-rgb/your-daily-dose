import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Daily cap of credits each workspace can receive in a rolling 24h window. */
export const PER_WORKSPACE_DAILY_CAP = 20;

/**
 * Returns the ISO timestamp at which `workspace` will be allowed to receive
 * credits again, or `null` if it's already free.
 * Uses the SQL helper `public.workspace_cooldown_until`.
 */
export async function getWorkspaceCooldownUntil(
  sb: SupabaseClient,
  workspace: string | null | undefined,
): Promise<string | null> {
  const ws = (workspace ?? "").trim();
  if (!ws) return null;
  const { data, error } = await sb.rpc("workspace_cooldown_until", { _workspace: ws });
  if (error) {
    console.warn("workspace_cooldown_until err", error);
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * Persists a one-shot schedule that will retry a single-workspace order at
 * `scheduledFor`. Returns the schedule id or throws.
 */
export async function createCooldownSchedule(
  sb: SupabaseClient,
  opts: {
    partnerId: string;
    botId?: string | null;
    customerName: string;
    customerEmail: string;
    customerWhatsapp?: string | null;
    targetWorkspace: string;
    credits: number;
    amountCentsPerRun: number;
    pricePerWorkspaceCents?: number | null;
    multi?: boolean;
    scheduledFor: string;
    notes: string;
    createdBy?: string | null;
  },
): Promise<string> {
  const insertRow: Record<string, unknown> = {
    partner_id: opts.partnerId,
    bot_id: opts.botId ?? null,
    created_by: opts.createdBy ?? opts.partnerId,
    customer_name: opts.customerName,
    customer_email: opts.customerEmail.toLowerCase(),
    customer_whatsapp: opts.customerWhatsapp ?? null,
    notes: opts.notes,
    workspaces: [],
    multi_workspace_mode: !!opts.multi,
    start_at: opts.scheduledFor,
    next_run_at: opts.scheduledFor,
    end_mode: "days",
    total_days: 1,
    status: "active",
  };
  if (opts.multi) {
    insertRow.price_cents_per_workspace = opts.pricePerWorkspaceCents ?? 0;
  } else {
    insertRow.target_workspace = opts.targetWorkspace;
    insertRow.credits_per_run = opts.credits;
    insertRow.amount_cents_per_run = opts.amountCentsPerRun;
  }
  const { data, error } = await sb
    .from("partner_order_schedules")
    .insert(insertRow)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Falha ao agendar pedido");
  return data.id as string;
}