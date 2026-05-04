export type LicenseStatus = "active" | "ativo" | "pending" | "blocked" | "bloqueado" | "expired" | "expirado";

export type AppLicense = {
  id: string;
  customer_email: string;
  customer_name: string | null;
  partner_id: string | null;
  partner_name: string | null;
  partner_whatsapp: string | null;
  status: string;
  plan_code: string;
  plan_name: string | null;
  max_machines: number;
  machine_hash: string | null;
  machine_hashes: string[] | null;
  expires_at: string | null;
  activated_at: string | null;
  last_seen_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  id_do_usuario: string | null;
};

export const PLAN_OPTIONS = [
  { code: "monthly", name: "Mensal", days: 30 },
  { code: "quarterly", name: "Trimestral", days: 90 },
  { code: "semiannual", name: "Semestral", days: 180 },
  { code: "annual", name: "Anual", days: 365 },
] as const;

export function planNameFromCode(code: string): string {
  return PLAN_OPTIONS.find((p) => p.code === code)?.name ?? code;
}

export function planDaysFromCode(code: string): number {
  return PLAN_OPTIONS.find((p) => p.code === code)?.days ?? 30;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dateInputToIso(value: string): string | null {
  if (!value) return null;
  // Treat as end-of-day local
  const d = new Date(value + "T23:59:59");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export type NormalizedStatus = "ativo" | "pendente" | "bloqueado" | "expirado";

export function normalizeStatus(license: Pick<AppLicense, "status" | "expires_at">): NormalizedStatus {
  const s = (license.status || "").toLowerCase();
  const expired = license.expires_at ? new Date(license.expires_at).getTime() < Date.now() : false;
  if (s === "blocked" || s === "bloqueado") return "bloqueado";
  if (s === "pending") return "pendente";
  if (s === "expired" || s === "expirado" || expired) return "expirado";
  if (s === "active" || s === "ativo") return "ativo";
  return "pendente";
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function friendlySupabaseError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return "Erro desconhecido.";
  const msg = error.message || "";
  if (error.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return "Você não tem permissão. Verifique se seu cadastro de parceiro está ativo.";
  }
  if (/duplicate key|unique/i.test(msg)) {
    return "Já existe uma licença com esses dados.";
  }
  return msg || "Erro ao processar a requisição.";
}