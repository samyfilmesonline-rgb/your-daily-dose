import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Pause, Play, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import GlitchText from "@/components/landing/GlitchText";

type Schedule = {
  id: string;
  partner_id: string;
  bot_id: string | null;
  customer_name: string;
  customer_email: string;
  price_cents_per_workspace: number | null;
  multi_workspace_mode: boolean;
  target_workspace: string | null;
  credits_per_run: number | null;
  amount_cents_per_run: number | null;
  start_at: string;
  end_mode: "days" | "until_date";
  total_days: number | null;
  end_at: string | null;
  status: "active" | "paused" | "completed" | "canceled";
  next_run_at: string;
  last_run_at: string | null;
  runs_completed: number;
  runs_failed: number;
  notes: string | null;
  created_at: string;
};

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const statusMeta: Record<Schedule["status"], { label: string; cls: string }> = {
  active: { label: "Ativa", cls: "bg-primary/15 text-primary border-primary/40" },
  paused: { label: "Pausada", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  completed: { label: "Concluída", cls: "bg-muted text-muted-foreground border-muted-foreground/30" },
  canceled: { label: "Cancelada", cls: "bg-destructive/15 text-destructive border-destructive/40" },
};

export default function Programacoes() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["my-schedules", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from("partner_order_schedules")
        .select("*")
        .order("created_at", { ascending: false });
      if (!isAdmin) q = q.eq("partner_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Schedule[];
    },
  });

  async function act(scheduleId: string, action: "cancel" | "pause" | "resume") {
    try {
      const { data, error } = await supabase.functions.invoke(
        "partner-shop-cancel-order-schedule",
        { body: { scheduleId, action } },
      );
      if (error) throw error;
      toast({ title: "Programação atualizada", description: `Status: ${(data as { status?: string })?.status ?? "ok"}` });
      qc.invalidateQueries({ queryKey: ["my-schedules", user?.id] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast({ title: "Falha", description: msg, variant: "destructive" });
    }
  }

  const stats = useMemo(() => {
    const active = schedules.filter((s) => s.status === "active").length;
    return { total: schedules.length, active };
  }, [schedules]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-primary" />
          <GlitchText>Programações</GlitchText>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {stats.active} ativa(s) de {stats.total} total. Cada programação cria um pedido novo todo dia no mesmo horário.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma programação ainda. Crie uma a partir do dialog "Nova recarga manual" → ative "Repetir diariamente".
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Bot</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Horário diário</TableHead>
                  <TableHead>Próximo</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead className="text-right">Execuções</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => {
                  const dailyTime = new Date(s.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  const prazo = s.end_mode === "days"
                    ? `${s.total_days} dias`
                    : `até ${fmtDateTime(s.end_at)}`;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{s.customer_name}</div>
                        <div className="text-[10px] text-muted-foreground">{s.customer_email}</div>
                      </TableCell>
                      <TableCell>
                        {s.multi_workspace_mode ? (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                            Multi-WS
                          </Badge>
                        ) : (
                          <div className="text-[10px]">
                            <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/30 text-[10px]">
                              Single
                            </Badge>
                            <div className="text-muted-foreground mt-0.5">
                              {s.target_workspace} · {s.credits_per_run} cr
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.bot_id ? (
                          <span className="font-mono text-[10px]">{s.bot_id.slice(0, 8)}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Automático</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusMeta[s.status].cls}>
                          {statusMeta[s.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{dailyTime}</TableCell>
                      <TableCell className="text-xs">{fmtDateTime(s.next_run_at)}</TableCell>
                      <TableCell className="text-xs">{prazo}</TableCell>
                      <TableCell className="text-right text-xs">
                        {s.runs_completed} ok
                        {s.runs_failed > 0 ? ` · ${s.runs_failed} falha(s)` : ""}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {s.status === "active" && (
                            <Button size="sm" variant="outline" onClick={() => act(s.id, "pause")}>
                              <Pause className="w-3 h-3" />
                            </Button>
                          )}
                          {s.status === "paused" && (
                            <Button size="sm" variant="outline" onClick={() => act(s.id, "resume")}>
                              <Play className="w-3 h-3" />
                            </Button>
                          )}
                          {(s.status === "active" || s.status === "paused") && (
                            <Button size="sm" variant="outline" onClick={() => act(s.id, "cancel")}>
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}