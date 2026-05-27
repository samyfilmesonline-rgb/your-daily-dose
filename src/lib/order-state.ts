import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCcw,
  UserPlus,
  Layers,
  type LucideIcon,
} from "lucide-react";

export type OrderState =
  | "pending"
  | "paid"
  | "queued"
  | "processing"
  | "waiting_invite"
  | "waiting_workspace"
  | "delivered"
  | "failed"
  | "expired"
  | "refunded";

export type StateMeta = {
  label: string;
  tone: "muted" | "info" | "warn" | "success" | "danger";
  icon: LucideIcon;
  className: string;
};

export const ORDER_STATE_META: Record<OrderState, StateMeta> = {
  pending:            { label: "Aguardando pagamento", tone: "muted",   icon: Clock,        className: "bg-muted text-muted-foreground border-border" },
  paid:               { label: "Pago",                  tone: "info",    icon: CheckCircle2, className: "bg-primary/10 text-primary border-primary/30" },
  queued:             { label: "Na fila",               tone: "info",    icon: Clock,        className: "bg-primary/10 text-primary border-primary/30" },
  processing:         { label: "Processando",           tone: "info",    icon: Loader2,      className: "bg-primary/15 text-primary border-primary/30 animate-pulse" },
  waiting_invite:     { label: "Aguardando convite",    tone: "warn",    icon: UserPlus,     className: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30" },
  waiting_workspace:  { label: "Aguardando workspace",  tone: "warn",    icon: Layers,       className: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30" },
  delivered:          { label: "Entregue",              tone: "success", icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  failed:             { label: "Falhou",                tone: "danger",  icon: XCircle,      className: "bg-destructive/15 text-destructive border-destructive/30" },
  expired:            { label: "Expirado",              tone: "muted",   icon: AlertTriangle,className: "bg-muted text-muted-foreground border-border" },
  refunded:           { label: "Reembolsado",           tone: "warn",    icon: RefreshCcw,   className: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30" },
};

export function orderStateMeta(status: string): StateMeta {
  return (ORDER_STATE_META as Record<string, StateMeta>)[status] ?? {
    label: status,
    tone: "muted",
    icon: Clock,
    className: "bg-muted text-muted-foreground border-border",
  };
}