import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  WORKER_EVENT_META,
  type WorkerEvent,
  type WorkerEventType,
  maskSecrets,
} from "@/lib/worker-events";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const toneClass: Record<string, string> = {
  info: "text-muted-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warn: "text-yellow-600 dark:text-yellow-400",
  danger: "text-destructive",
};

export default function OrderEventTimeline({ orderId }: { orderId: string }) {
  const [events, setEvents] = useState<WorkerEvent[]>([]);

  useEffect(() => {
    let active = true;
    supabase
      .from("worker_events")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (active && data) setEvents(data as WorkerEvent[]);
      });

    const ch = supabase
      .channel(`worker_events:${orderId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "worker_events", filter: `order_id=eq.${orderId}` },
        (payload) => {
          setEvents((prev) => [payload.new as WorkerEvent, ...prev].slice(0, 50));
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [orderId]);

  const captcha = events.find((e) => e.event_type === "captcha_required" && e.severity === "action_required");

  if (events.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Sem eventos do worker ainda.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {captcha && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
          <div>
            <div className="font-medium text-destructive">Ação manual necessária</div>
            <div className="text-xs text-muted-foreground">
              {maskSecrets(captcha.message ?? "Resolva o captcha (hCaptcha) no worker para continuar.")}
            </div>
          </div>
        </div>
      )}
      <ol className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {events.map((e) => {
          const meta = WORKER_EVENT_META[e.event_type as WorkerEventType] ?? null;
          const Icon = meta?.icon ?? AlertTriangle;
          return (
            <li key={e.id} className="flex items-start gap-2 text-xs">
              <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", toneClass[meta?.tone ?? "info"])} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{meta?.label ?? e.event_type}</span>
                  <span className="text-muted-foreground">
                    {new Date(e.created_at).toLocaleTimeString("pt-BR")}
                  </span>
                </div>
                {e.message && (
                  <div className="text-muted-foreground break-words">
                    {maskSecrets(e.message)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}