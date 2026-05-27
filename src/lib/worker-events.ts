import {
  CheckCircle2,
  AlertTriangle,
  Layers,
  ShieldAlert,
  Coins,
  Flag,
  ArrowUpCircle,
  ArrowDownCircle,
  type LucideIcon,
} from "lucide-react";

export type WorkerEventType =
  | "billing_plan_checked"
  | "workspace_selected"
  | "captcha_required"
  | "credits_farmed"
  | "order_finished"
  | "billing_upgrade_attempted"
  | "billing_downgrade_corrected";

export type WorkerEvent = {
  id: string;
  order_id: string | null;
  bot_id: string | null;
  partner_id: string;
  event_type: WorkerEventType;
  severity: "info" | "warn" | "action_required";
  message: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export const WORKER_EVENT_META: Record<
  WorkerEventType,
  { label: string; icon: LucideIcon; tone: "info" | "success" | "warn" | "danger" }
> = {
  billing_plan_checked:        { label: "Plano verificado",        icon: CheckCircle2,    tone: "info" },
  workspace_selected:          { label: "Workspace selecionado",   icon: Layers,          tone: "info" },
  captcha_required:            { label: "Captcha pendente",        icon: ShieldAlert,     tone: "danger" },
  credits_farmed:              { label: "Créditos farmados",       icon: Coins,           tone: "success" },
  order_finished:              { label: "Pedido finalizado",       icon: Flag,            tone: "success" },
  billing_upgrade_attempted:   { label: "Upgrade PRO tentado",     icon: ArrowUpCircle,   tone: "info" },
  billing_downgrade_corrected: { label: "Downgrade falso corrigido", icon: ArrowDownCircle, tone: "warn" },
};

const SECRET_RE: RegExp[] = [
  /\b\d{13,19}\b/g,
  /sk_(live|test)_[A-Za-z0-9]+/g,
  /pk_(live|test)_[A-Za-z0-9]+/g,
  /eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
  /service_role[^\s"']*/gi,
  /https?:\/\/(checkout\.)?stripe\.com\/[^\s"']+/g,
];

export function maskSecrets(input: string): string {
  let v = input;
  for (const re of SECRET_RE) v = v.replace(re, "••••");
  return v;
}

export function maskAny(value: unknown): unknown {
  if (typeof value === "string") return maskSecrets(value);
  if (Array.isArray(value)) return value.map(maskAny);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/card|cvc|cvv|token|secret|password|senha/i.test(k)) out[k] = "••••";
      else out[k] = maskAny(v);
    }
    return out;
  }
  return value;
}