import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Activity, Loader2, Pause, Power } from "lucide-react";
import { cn } from "@/lib/utils";

type Bot = { id: string; status: string; last_heartbeat_at: string | null };
type Health = { tone: "success" | "info" | "warn" | "danger"; label: string; icon: typeof Activity; tooltip?: string };

function computeHealth(bots: Bot[]): Health {
  if (!bots.length) {
    return { tone: "danger", label: "Sem bots", icon: Power, tooltip: "Nenhum bot cadastrado" };
  }
  const now = Date.now();
  const online = bots.filter((b) => b.last_heartbeat_at && now - new Date(b.last_heartbeat_at).getTime() < 60_000);
  const recent = bots.filter((b) => b.last_heartbeat_at && now - new Date(b.last_heartbeat_at).getTime() < 5 * 60_000);
  const busy = online.find((b) => b.status === "busy");

  if (busy) return { tone: "info", label: "Worker processando", icon: Loader2 };
  if (online.length) return { tone: "success", label: "Worker online", icon: Activity };
  if (recent.length) return { tone: "warn", label: "Worker idle", icon: Pause, tooltip: "Sem heartbeat há mais de 1 minuto" };

  const last = bots
    .map((b) => (b.last_heartbeat_at ? new Date(b.last_heartbeat_at).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  const min = last ? Math.round((now - last) / 60_000) : null;
  return {
    tone: "danger",
    label: "Worker parado",
    icon: Power,
    tooltip: min ? `Sem sinal há ${min} min` : "Sem heartbeat recente",
  };
}

const toneClass: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  info: "bg-primary/10 text-primary border-primary/30",
  warn: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function WorkerHealthBadge() {
  const { user, viewAs } = useAuth();
  const partnerId = viewAs ?? user?.id ?? null;
  const [bots, setBots] = useState<Bot[]>([]);

  useEffect(() => {
    if (!partnerId) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("farm_bots")
        .select("id,status,last_heartbeat_at")
        .eq("partner_id", partnerId);
      if (active && data) setBots(data as Bot[]);
    };
    load();
    const ch = supabase
      .channel(`farm_bots_health:${partnerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "farm_bots", filter: `partner_id=eq.${partnerId}` },
        () => load(),
      )
      .subscribe();
    const t = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(t);
      supabase.removeChannel(ch);
    };
  }, [partnerId]);

  if (!partnerId) return null;
  const h = computeHealth(bots);
  const Icon = h.icon;
  return (
    <span
      title={h.tooltip}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        toneClass[h.tone],
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", h.tone === "info" && "animate-spin")} />
      {h.label}
    </span>
  );
}