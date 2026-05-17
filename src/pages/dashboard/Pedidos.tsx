import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, Search, AlertTriangle, Clock, Loader2, CheckCircle2, Plus, XCircle, RotateCw, Square, SkipForward, CheckSquare, RefreshCcw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import GlitchText from "@/components/landing/GlitchText";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ManualOrderDialog from "@/components/dashboard/ManualOrderDialog";
import { cleanWorkspaceName } from "@/lib/workspace-name";

const dn = (s: string | null | undefined) => cleanWorkspaceName(s) || "—";

type OrderStatus =
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

type Order = {
  id: string;
  partner_id: string;
  pack_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_whatsapp: string | null;
  target_workspace: string | null;
  credits: number;
  amount_cents: number;
  status: OrderStatus;
  tx_id: string | null;
  is_manual: boolean | null;
  pix_qrcode: string | null;
  pix_copy_paste: string | null;
  pix_expires_at: string | null;
  paid_at: string | null;
  assigned_bot_id: string | null;
  assigned_at: string | null;
  delivered_at: string | null;
  failed_reason: string | null;
  created_at: string;
  raw_payload: Record<string, unknown> | null;
  multi_workspace_mode?: boolean | null;
  workspaces_total?: number | null;
  workspaces_done?: number | null;
  current_workspace?: string | null;
  last_workspace?: string | null;
  stop_requested_at?: string | null;
  workspaces_plan?: Array<{
    name: string;
    status: "pending" | "running" | "done" | "failed" | "skipped";
    farmed: number;
    error: string | null;
    started_at?: string | null;
    finished_at?: string | null;
    limited?: boolean;
  }> | null;
  workspaces_history?: Array<{
    attempted_at: string;
    failed_reason: string | null;
    plan: Array<{ name: string; status: string; farmed: number }>;
    mode?: string;
  }> | null;
};

type BotMini = {
  id: string;
  nickname: string | null;
  email_lovable: string;
  status: "idle" | "busy" | "offline" | "disabled" | string;
  last_heartbeat_at: string | null;
};

const statusMeta: Record<OrderStatus, { label: string; cls: string }> = {
  pending:    { label: "Aguardando pagamento", cls: "bg-muted text-muted-foreground border-muted-foreground/30" },
  paid:       { label: "Pago",                 cls: "bg-primary/10 text-primary border-primary/40" },
  queued:     { label: "Na fila",              cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  processing: { label: "Farm em execução",     cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  waiting_invite:    { label: "Aguardando confirmação do bot como Owner", cls: "bg-sky-500/15 text-sky-400 border-sky-500/40" },
  waiting_workspace: { label: "Aguardando workspace válido",              cls: "bg-indigo-500/15 text-indigo-400 border-indigo-500/40" },
  delivered:  { label: "Entregue",             cls: "bg-primary/15 text-primary border-primary/40" },
  failed:     { label: "Falhou",               cls: "bg-destructive/15 text-destructive border-destructive/40" },
  expired:    { label: "Expirado",             cls: "bg-muted text-muted-foreground border-muted-foreground/30" },
  refunded:   { label: "Reembolsado",          cls: "bg-muted text-muted-foreground border-muted-foreground/30" },
};

const STATUSES: OrderStatus[] = ["pending", "paid", "queued", "processing", "waiting_invite", "waiting_workspace", "delivered", "failed", "expired", "refunded"];

function isStopping(o: Pick<Order, "stop_requested_at" | "status">) {
  return !!o.stop_requested_at && ["paid", "queued", "processing"].includes(o.status);
}

const FARM_ACTIVE_HEARTBEAT_MS = 90 * 1000;
const FARM_ACTIVE_BOOT_MS = 60 * 1000;

function isFarmActive(
  o: Pick<Order, "status" | "assigned_bot_id" | "assigned_at">,
  bot: BotMini | undefined | null,
): boolean {
  if (o.status !== "processing") return false;
  const now = Date.now();
  if (bot && bot.status === "busy") {
    const hb = bot.last_heartbeat_at ? new Date(bot.last_heartbeat_at).getTime() : 0;
    if (hb && now - hb < FARM_ACTIVE_HEARTBEAT_MS) return true;
  }
  // grace period right after assignment, before the worker's first heartbeat
  const assigned = o.assigned_at ? new Date(o.assigned_at).getTime() : 0;
  if (assigned && now - assigned < FARM_ACTIVE_BOOT_MS) return true;
  return false;
}

function effectiveBadge(o: Pick<Order, "stop_requested_at" | "status">): { label: string; cls: string } {
  if (isStopping(o)) {
    return { label: "Parando…", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" };
  }
  return (
    statusMeta[o.status] ?? {
      label: String(o.status ?? "—"),
      cls: "bg-muted text-muted-foreground border-muted-foreground/30",
    }
  );
}

function brl(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Pedidos() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  useEffect(() => { document.title = "Pedidos · Matrix"; }, []);

  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Order | null>(null);
  const [forcePaidNotes, setForcePaidNotes] = useState("");
  const [forcePaidLoading, setForcePaidLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [retryLoading, setRetryLoading] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [forceCompleteLoading, setForceCompleteLoading] = useState(false);
  const [retryFailedLoading, setRetryFailedLoading] = useState(false);

  const { data: orders = [] } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_credit_orders")
        .select("*")
        .eq("partner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Order[];
    },
  });

  const { data: bots = [] } = useQuery({
    queryKey: ["my-bots-mini", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("farm_bots_partner_view")
        .select("id, nickname, email_lovable, status, last_heartbeat_at")
        .eq("partner_id", user!.id);
      if (error) throw error;
      return (data ?? []) as BotMini[];
    },
  });

  const botById = useMemo(() => {
    const m = new Map<string, BotMini>();
    bots.forEach((b) => m.set(b.id, b));
    return m;
  }, [bots]);

  useEffect(() => {
    if (!user?.id) return;
    const orders = supabase
      .channel(`orders-rt-${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "partner_credit_orders", filter: `partner_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-orders", user.id] }))
      .subscribe();
    const botsCh = supabase
      .channel(`farm-bots-rt-${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "farm_bots", filter: `partner_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-bots-mini", user.id] }))
      .subscribe();
    return () => {
      supabase.removeChannel(orders);
      supabase.removeChannel(botsCh);
    };
  }, [user?.id, qc]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (q && ![o.customer_name, o.customer_email, o.target_workspace ?? ""].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [orders, statusFilter, search]);

  const stats = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 3600 * 1000;
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const noWs = orders.filter(
      (o) => !o.target_workspace && !o.multi_workspace_mode && ["paid", "queued", "processing"].includes(o.status)
    ).length;
    const stale = orders.filter((o) => {
      if (o.status !== "processing" || !o.assigned_bot_id) return false;
      const bot = botById.get(o.assigned_bot_id);
      const hb = bot?.last_heartbeat_at ? new Date(bot.last_heartbeat_at).getTime() : 0;
      return hb < tenMinAgo;
    }).length;
    return {
      queued: orders.filter((o) => o.status === "queued").length,
      processing: orders.filter((o) => o.status === "processing").length,
      failed24h: orders.filter((o) => o.status === "failed" && new Date(o.created_at).getTime() > oneDayAgo).length,
      noWs,
      stale,
    };
  }, [orders, botById]);

  const fmtAgo = (iso: string | null) => {
    if (!iso) return "—";
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h}h`;
    return `há ${Math.floor(h / 24)}d`;
  };

  const detailBot = detail?.assigned_bot_id ? botById.get(detail.assigned_bot_id) ?? null : null;

  const { data: progress } = useQuery({
    queryKey: [
      "order-progress",
      detail?.id,
      detailBot?.email_lovable,
      detail?.target_workspace,
      detail?.multi_workspace_mode ? (detail?.workspaces_plan?.map((w) => w.name).join(",") ?? "") : "",
    ],
    enabled:
      !!detail?.id &&
      !!detailBot?.email_lovable &&
      (
        (!!detail?.multi_workspace_mode && Array.isArray(detail?.workspaces_plan) && (detail?.workspaces_plan?.length ?? 0) > 0)
        || !!detail?.target_workspace
      ),
    refetchInterval: 5000,
    queryFn: async () => {
      const since = detail!.assigned_at ?? detail!.paid_at;
      let q = supabase
        .from("execucoes_lovable")
        .select("status, creditos_adicionados, erro, atualizado_em, iniciado_em, workspace_nome")
        .eq("id_do_usuario", detail!.partner_id)
        .eq("email_lovable", detailBot!.email_lovable)
        .order("iniciado_em", { ascending: false })
        .limit(50);
      if (detail!.multi_workspace_mode && Array.isArray(detail!.workspaces_plan)) {
        const names = detail!.workspaces_plan.map((w) => w.name);
        if (names.length > 0) q = q.in("workspace_nome", names);
      } else if (detail!.target_workspace) {
        q = q.eq("workspace_nome", detail!.target_workspace);
      }
      if (since) q = q.gte("iniciado_em", since);
      const { data } = await q;
      const list = (data ?? []) as Array<{
        status: string;
        creditos_adicionados: number | string | null;
        erro: string | null;
        atualizado_em: string | null;
        iniciado_em: string | null;
      }>;
      const farmed = list.reduce((a, r) => a + (Number(r.creditos_adicionados) || 0), 0);
      return { farmed, attempts: list.length, last: list[0] ?? null };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-primary/70">
          <Activity className="w-3.5 h-3.5" /> Console / Pedidos
        </div>
        <h1 className="text-3xl sm:text-4xl font-black font-mono">
          <GlitchText>PEDIDOS</GlitchText>
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Pedidos dos seus clientes em tempo real. A atribuição de bot é automática.
        </p>
      </div>

      {(stats.queued > 0 || stats.processing > 0 || stats.failed24h > 0) && (
        <div className="grid sm:grid-cols-3 gap-3">
          {stats.queued > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span><strong>{stats.queued}</strong> aguardando bot</span>
            </div>
          )}
          {stats.processing > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
              <span><strong>{stats.processing}</strong> em processamento</span>
            </div>
          )}
          {stats.failed24h > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span><strong>{stats.failed24h}</strong> falharam nas últimas 24h</span>
            </div>
          )}
        </div>
      )}

      {(stats.noWs > 0 || stats.stale > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {stats.noWs > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span><strong>{stats.noWs}</strong> pedido(s) sem workspace informado</span>
            </div>
          )}
          {stats.stale > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span><strong>{stats.stale}</strong> pedido(s) com worker offline (sem heartbeat &gt;10 min)</span>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Lista de pedidos</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={() => setManualOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Nova recarga manual
              </Button>
              <div className="relative w-full sm:w-72">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, email, workspace..." className="pl-9" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => setStatusFilter("all")}>
              Todos ({orders.length})
            </Button>
            {STATUSES.map((s) => {
              const count = orders.filter((o) => o.status === s).length;
              if (count === 0) return null;
              return (
                <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
                  {statusMeta[s].label} ({count})
                </Button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Pacote</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bot</TableHead>
                <TableHead>Heartbeat</TableHead>
                <TableHead>Criado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum pedido.</TableCell></TableRow>
              )}
              {filtered.map((o) => {
                const meta = statusMeta[o.status];
                const bot = o.assigned_bot_id ? botById.get(o.assigned_bot_id) : null;
                const tenMinAgo = Date.now() - 10 * 60 * 1000;
                const hbMs = bot?.last_heartbeat_at ? new Date(bot.last_heartbeat_at).getTime() : 0;
                const stale = o.status === "processing" && !!bot && hbMs < tenMinAgo;
                const wsMissing = !o.target_workspace && ["paid", "queued", "processing"].includes(o.status);
                return (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => setDetail(o)}>
                    <TableCell>
                      <div className="font-medium">{o.customer_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{o.customer_email}</div>
                      {o.customer_whatsapp && (
                        <div className="text-xs text-muted-foreground font-mono">{o.customer_whatsapp}</div>
                      )}
                      {o.is_manual && (
                        <div className="mt-0.5 inline-block text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary/40 text-primary bg-primary/10">
                          Manual
                        </div>
                      )}
                      {(() => {
                        const retries = (o.raw_payload as { manualOrder?: { retries?: unknown[] } } | null)
                          ?.manualOrder?.retries;
                        const n = Array.isArray(retries) ? retries.length : 0;
                        if (!n) return null;
                        return (
                          <div className="mt-0.5 ml-1 inline-block text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-400 bg-amber-500/10">
                            Tentativa #{n + 1}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {o.multi_workspace_mode ? (
                        <>
                          <div>{dn(o.current_workspace)}</div>
                          {o.workspaces_total == null ? (
                            <div className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Descobrindo workspaces…
                            </div>
                          ) : (
                            <div className="mt-1 w-32 max-w-full">
                              <Progress
                                value={Math.round(((o.workspaces_done ?? 0) / Math.max(1, o.workspaces_total)) * 100)}
                                className="h-1.5"
                              />
                              <div className="text-[10px] text-primary mt-0.5">
                                {o.workspaces_done ?? 0}/{o.workspaces_total} workspaces
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        o.target_workspace ? dn(o.target_workspace) : <span className="text-destructive">— faltando</span>
                      )}
                      {wsMissing && !o.multi_workspace_mode && (
                        <div className="text-[10px] text-destructive mt-0.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> precisa contato
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{o.credits} cr · {brl(o.amount_cents)}</TableCell>
                    <TableCell>
                      {(() => {
                        const eb = effectiveBadge(o);
                        return (
                          <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${eb.cls}`}>
                            {eb.label}
                          </span>
                        );
                      })()}
                      {o.status === "failed" && o.failed_reason && (
                        <div className="text-[10px] text-destructive mt-1 max-w-[180px] truncate" title={o.failed_reason}>
                          {o.failed_reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {bot ? (
                        <>
                          <div>{bot.nickname ?? bot.email_lovable}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">{bot.status}</div>
                        </>
                      ) : o.assigned_bot_id ? (
                        o.assigned_bot_id.slice(0, 8) + "…"
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {bot ? (
                        <span className={stale ? "text-amber-400" : "text-muted-foreground"}>
                          {fmtAgo(bot.last_heartbeat_at)}
                          {stale && (
                            <span className="ml-1 inline-flex items-center gap-0.5">
                              <AlertTriangle className="w-3 h-3" /> worker offline
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pedido {detail?.id.slice(0, 8)}…</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              {(() => {
                const reason = detail.failed_reason ?? "";
                const planLimited = Array.isArray(detail.workspaces_plan) && detail.workspaces_plan.some(
                  (w) => w.limited === true || (w.error ?? "").startsWith("stripe_daily_farm_limit_reached"),
                );
                if (!planLimited && !reason.startsWith("stripe_daily_farm_limit_reached")) return null;
                return (
                  <div className="rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-200 text-[11px] p-2">
                    Limite diário do workspace atingido — 200 cr contabilizados. Sem retry no Stripe.
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Cliente:</span> {detail.customer_name}</div>
                <div><span className="text-muted-foreground">Email:</span> {detail.customer_email}</div>
                <div><span className="text-muted-foreground">WhatsApp:</span> {detail.customer_whatsapp ?? "—"}</div>
                <div>
                  <span className="text-muted-foreground">Workspace:</span>{" "}
                  {detail.multi_workspace_mode
                    ? `${dn(detail.current_workspace ?? detail.last_workspace)} (todos · ${detail.workspaces_done ?? 0}/${detail.workspaces_total ?? "?"})`
                    : dn(detail.target_workspace)}
                </div>
                <div>
                  <span className="text-muted-foreground">Créditos:</span>{" "}
                  {(() => {
                    if (detail.multi_workspace_mode && Array.isArray(detail.workspaces_plan)) {
                      const farmedNow = detail.workspaces_plan.reduce((a, w) => a + (Number(w.farmed) || 0), 0);
                      const farmedHist = (detail.workspaces_history ?? []).reduce(
                        (a, h) => a + (h.plan ?? []).reduce((b, w) => b + (Number(w.farmed) || 0), 0),
                        0,
                      );
                      const totalHist = farmedHist > 0 ? ` (+${farmedHist} de tentativas anteriores)` : "";
                      return <>{farmedNow}{totalHist}</>;
                    }
                    return detail.credits;
                  })()}
                </div>
                <div><span className="text-muted-foreground">Valor:</span> {brl(detail.amount_cents)}</div>
                <div><span className="text-muted-foreground">Tx:</span> <span className="font-mono">{detail.tx_id ?? "—"}</span></div>
                <div><span className="text-muted-foreground">Status:</span> {effectiveBadge(detail).label}</div>
                <div><span className="text-muted-foreground">Pago em:</span> {detail.paid_at ? new Date(detail.paid_at).toLocaleString("pt-BR") : "—"}</div>
                <div><span className="text-muted-foreground">Entregue em:</span> {detail.delivered_at ? new Date(detail.delivered_at).toLocaleString("pt-BR") : "—"}</div>
                <div><span className="text-muted-foreground">Pix expira:</span> {detail.pix_expires_at ? new Date(detail.pix_expires_at).toLocaleString("pt-BR") : "—"}</div>
                <div><span className="text-muted-foreground">Bot:</span> {detail.assigned_bot_id ? (botById.get(detail.assigned_bot_id)?.email_lovable ?? detail.assigned_bot_id) : "—"}</div>
              </div>
              {detail.multi_workspace_mode && Array.isArray(detail.workspaces_plan) && detail.workspaces_plan.length > 0 && (
                <div className="rounded-md border p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Workspaces ({detail.workspaces_done ?? 0}/{detail.workspaces_total ?? detail.workspaces_plan.length})
                  </div>
                  {(() => {
                    const plan = detail.workspaces_plan!;
                    const counts = {
                      done: plan.filter((w) => w.status === "done").length,
                      running: plan.filter((w) => w.status === "running").length,
                      pending: plan.filter((w) => w.status === "pending").length,
                      failed: plan.filter((w) => w.status === "failed").length,
                      skipped: plan.filter((w) => w.status === "skipped").length,
                    };
                    const next = plan.find((w) => w.status === "running") ?? plan.find((w) => w.status === "pending");
                    return (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-mono mb-1.5">
                        <span className="text-primary">{counts.done} concluído</span>
                        <span className="text-amber-400">{counts.running} rodando</span>
                        <span className="text-muted-foreground">{counts.pending} aguardando</span>
                        <span className="text-destructive">{counts.failed} falhou</span>
                        <span className="text-muted-foreground">{counts.skipped} ignorado</span>
                        {detail.status === "processing" && next && (
                          <span className="ml-auto text-primary/80">
                            {counts.running > 0 ? "atual" : "próximo"}: <strong>{dn(next.name)}</strong>
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <div className="max-h-48 overflow-y-auto">
                    {detail.workspaces_plan.map((w) => (
                      <div
                        key={w.name}
                        title={w.error ?? undefined}
                        className="flex items-center justify-between gap-2 text-[11px] font-mono py-0.5 border-b border-border/40 last:border-0"
                      >
                        <span className="truncate flex-1">{dn(w.name)}</span>
                        <span className="text-muted-foreground">
                          {w.farmed} cr
                          {(w.status === "skipped" || w.status === "failed") && w.farmed > 0 ? " parcial" : ""}
                        </span>
                        {(() => {
                          const ineligible =
                            w.status === "failed" && (w.error ?? "").startsWith("workspace_ineligible:");
                          const limited =
                            w.status === "done" &&
                            (w.limited === true || (w.error ?? "").startsWith("stripe_daily_farm_limit_reached"));
                          const map: Record<string, { label: string; cls: string }> = {
                            done:    { label: "concluído",      cls: "text-primary" },
                            running: { label: "em andamento",   cls: "text-amber-400" },
                            pending: { label: "aguardando",     cls: "text-muted-foreground" },
                            failed:  { label: "falhou",         cls: "text-destructive" },
                            skipped: { label: "ignorado",       cls: "text-muted-foreground" },
                          };
                          const m = ineligible
                            ? { label: "inapto · pulado", cls: "text-amber-500" }
                            : limited
                            ? { label: "limite diário · 200 cr", cls: "text-sky-400" }
                            : map[w.status] ?? { label: w.status, cls: "text-muted-foreground" };
                          return <span className={m.cls}>{m.label}</span>;
                        })()}
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const plan = detail.workspaces_plan!;
                    const hasMore = plan.some((w) => w.status === "pending" || w.status === "running");
                    const someFail = plan.some((w) => w.status === "failed");
                    if (detail.status === "processing" && hasMore && someFail) {
                      return (
                        <div className="text-[10px] text-amber-400 mt-1.5">
                          Falha em workspace(s) anteriores — o farm continua nos próximos automaticamente.
                        </div>
                      );
                    }
                    if (detail.status === "delivered" && (plan.some((w) => w.status === "failed" || w.status === "skipped"))) {
                      const failN = plan.filter((w) => w.status === "failed" || w.status === "skipped").length;
                      return (
                        <div className="text-[10px] text-amber-400 mt-1.5">
                          Entregue parcialmente — {failN} workspace(s) com falha/ignorado.
                        </div>
                      );
                    }
                    if (detail.status === "failed") {
                      const partialFarmed = plan.reduce((a, w) => a + (Number(w.farmed) || 0), 0);
                      if (partialFarmed > 0) {
                        return (
                          <div className="text-[10px] text-amber-400 mt-1.5">
                            Encerrado com {partialFarmed} cr parciais — nenhum workspace foi 100% concluído.
                          </div>
                        );
                      }
                      return (
                        <div className="text-[10px] text-destructive mt-1.5">
                          Nenhum workspace foi concluído com sucesso.
                        </div>
                      );
                    }
                    if (detail.status === "refunded") {
                      const doneN = plan.filter((w) => w.status === "done").length;
                      return (
                        <div className="text-[10px] text-muted-foreground mt-1.5">
                          Cancelado — {doneN} de {plan.length} workspaces concluídos antes da parada.
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
              {(() => {
                const showProgress = ["paid", "queued", "processing", "delivered", "refunded", "failed"].includes(detail.status);
                if (!showProgress) return null;
                const planFarmed = detail.multi_workspace_mode && Array.isArray(detail.workspaces_plan)
                  ? detail.workspaces_plan.reduce((a, w) => a + (Number(w.farmed) || 0), 0)
                  : 0;
                const target = detail.multi_workspace_mode && Array.isArray(detail.workspaces_plan)
                  ? (detail.workspaces_plan.length * 200)
                  : detail.credits;
                const liveFarmed = progress?.farmed ?? 0;
                const farmed = detail.status === "delivered"
                  ? target
                  : Math.max(planFarmed, liveFarmed);
                const pct = target > 0 ? Math.min(100, Math.round((farmed / target) * 100)) : 0;
                const tenMinAgo = Date.now() - 10 * 60 * 1000;
                const hbMs = detailBot?.last_heartbeat_at ? new Date(detailBot.last_heartbeat_at).getTime() : 0;
                const stale = detail.status === "processing" && !!detailBot && hbMs < tenMinAgo;
                const last = progress?.last;
                return (
                  <div className="rounded border border-primary/30 bg-primary/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-mono uppercase tracking-wider text-primary/80">Progresso ao vivo</div>
                      <div className="text-lg font-bold font-mono text-primary">{pct}%</div>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="text-xs font-mono text-muted-foreground">
                      {farmed} / {target} créditos farmados
                    </div>
                    {detailBot && (
                      <div className="text-[11px] flex items-center gap-2 flex-wrap">
                        <span className="text-muted-foreground">Bot:</span>
                        <span className="font-mono">{detailBot.nickname ?? detailBot.email_lovable}</span>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-primary/30 text-primary/80">{detailBot.status}</span>
                        <span className={stale ? "text-amber-400 flex items-center gap-1" : "text-muted-foreground"}>
                          {stale && <AlertTriangle className="w-3 h-3" />}
                          heartbeat {fmtAgo(detailBot.last_heartbeat_at)}
                        </span>
                      </div>
                    )}
                    {progress && progress.attempts > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        Tentativas do worker: <span className="font-mono">{progress.attempts}</span>
                        {last && (
                          <> · última: <span className="font-mono">{last.status}</span> {fmtAgo(last.atualizado_em ?? last.iniciado_em)}</>
                        )}
                      </div>
                    )}
                    {last?.erro && (
                      <div className="text-[11px] text-destructive/90 break-words">
                        Último erro: {last.erro}
                      </div>
                    )}
                  </div>
                );
              })()}
              {detail.status === "failed" && detail.failed_reason && (
                <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  <strong>Motivo da falha:</strong> {detail.failed_reason}
                </div>
              )}
              {detail.status === "pending" && detail.pix_copy_paste && (
                <div className="rounded border border-primary/30 bg-primary/5 p-2 space-y-1">
                  <div className="text-xs text-muted-foreground">Pix copia e cola (reenvie ao cliente):</div>
                  <Input readOnly value={detail.pix_copy_paste} className="font-mono text-xs" />
                </div>
              )}
              {detail.status === "pending" && (
                <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                  <div className="text-xs font-medium text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Marcar como pago manualmente
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Use só se o cliente apresentou comprovante e o gateway não confirmou. Anote o ID
                    end-to-end do Pix ou referência do banco. Esta ação é auditada.
                  </p>
                  <Textarea
                    value={forcePaidNotes}
                    onChange={(e) => setForcePaidNotes(e.target.value)}
                    placeholder="Ex.: Comprovante e2e ID E12345678... — verificado em 07/05/2026"
                    className="text-xs font-mono min-h-[60px]"
                  />
                  <Button
                    size="sm"
                    variant="default"
                    disabled={forcePaidLoading || forcePaidNotes.trim().length < 3}
                    onClick={async () => {
                      if (!detail) return;
                      setForcePaidLoading(true);
                      try {
                        const { error } = await supabase.functions.invoke(
                          "partner-shop-force-paid-order",
                          { body: { orderId: detail.id, notes: forcePaidNotes.trim() } }
                        );
                        if (error) throw error;
                        toast({ title: "Pedido marcado como pago", description: "Bot será atribuído automaticamente." });
                        setForcePaidNotes("");
                        setDetail(null);
                        qc.invalidateQueries({ queryKey: ["my-orders", user?.id] });
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : "Erro";
                        toast({ title: "Falha", description: msg, variant: "destructive" });
                      } finally {
                        setForcePaidLoading(false);
                      }
                    }}
                  >
                    {forcePaidLoading ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Processando...</>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirmar pagamento manual</>
                    )}
                  </Button>
                </div>
              )}
              {detail.is_manual && ["paid", "queued", "processing"].includes(detail.status) && (
                <div className="rounded border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                  <div className="text-xs font-medium text-destructive flex items-center gap-1">
                    <Square className="w-3.5 h-3.5" /> Parar farm / cancelar recarga
                  </div>
                  {isStopping(detail) ? (
                    <p className="text-[11px] text-amber-400">
                      Cancelamento solicitado em {new Date(detail.stop_requested_at!).toLocaleString("pt-BR")} —
                      aguardando o worker finalizar o workspace atual. O status final aparece aqui assim que o ciclo fechar.
                    </p>
                  ) : isFarmActive(detail, detailBot) ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-400">
                        Farm em andamento. Aguarde o worker finalizar ou pare com segurança —
                        clicar agora não interrompe o navegador, apenas pede para o worker encerrar no fim do workspace atual.
                        {detailBot?.last_heartbeat_at && <> Último heartbeat {fmtAgo(detailBot.last_heartbeat_at)}.</>}
                      </p>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={cancelLoading}
                        onClick={async () => {
                          if (!detail) return;
                          if (!confirm("Solicitar parada segura? O worker fecha o workspace atual e libera o bot.")) return;
                          setCancelLoading(true);
                          try {
                            const { data, error } = await supabase.functions.invoke(
                              "partner-shop-cancel-manual-order",
                              { body: { orderId: detail.id, reason: "stopped_by_admin" } }
                            );
                            if (error) throw error;
                            const refunded = (data as { refundedCredits?: number } | null)?.refundedCredits ?? 0;
                            toast({ title: "Parada solicitada", description: `Worker encerrará o workspace atual. Estorno previsto: ${refunded} cr.` });
                            qc.invalidateQueries({ queryKey: ["my-orders", user?.id] });
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : "Erro";
                            toast({ title: "Falha", description: msg, variant: "destructive" });
                          } finally {
                            setCancelLoading(false);
                          }
                        }}
                      >
                        {cancelLoading ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Solicitando…</>
                        ) : (
                          <><Square className="w-3.5 h-3.5 mr-1" /> Solicitar parada segura</>
                        )}
                      </Button>
                    </div>
                  ) : (
                  <>
                  <p className="text-[11px] text-muted-foreground">
                    Para o bot agora. Apenas a parte ainda não farmada é estornada para sua cota — o que já foi entregue é mantido.
                  </p>
                  <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={cancelLoading}
                    onClick={async () => {
                      if (!detail) return;
                      if (!confirm("Parar o farm agora? O restante será estornado para sua cota.")) return;
                      setCancelLoading(true);
                      try {
                        const { data, error } = await supabase.functions.invoke(
                          "partner-shop-cancel-manual-order",
                          { body: { orderId: detail.id, reason: "stopped_by_admin" } }
                        );
                        if (error) throw error;
                        const refunded = (data as { refundedCredits?: number } | null)?.refundedCredits ?? 0;
                        toast({ title: "Farm parado", description: `Estornados ${refunded} créditos para sua cota.` });
                        setDetail(null);
                        qc.invalidateQueries({ queryKey: ["my-orders", user?.id] });
                        qc.invalidateQueries({ queryKey: ["my-bots-mini", user?.id] });
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : "Erro";
                        toast({ title: "Falha ao parar", description: msg, variant: "destructive" });
                      } finally {
                        setCancelLoading(false);
                      }
                    }}
                  >
                    {cancelLoading ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Parando...</>
                    ) : (
                      <><Square className="w-3.5 h-3.5 mr-1" /> Parar e estornar</>
                    )}
                  </Button>
                  {detail.multi_workspace_mode && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={skipLoading}
                      onClick={async () => {
                        if (!detail) return;
                        const running = Array.isArray(detail.workspaces_plan)
                          ? detail.workspaces_plan.find((w) => w.status === "running")?.name
                          : null;
                        if (!confirm(`Pular o workspace atual${running ? ` (${running})` : ""} e seguir pro próximo?`)) return;
                        setSkipLoading(true);
                        try {
                          const { data, error } = await supabase.rpc("skip_current_workspace", { _order_id: detail.id });
                          if (error) throw error;
                          const d = data as { skipped?: string; nextWorkspace?: string | null; partial?: number } | null;
                          toast({
                            title: `Workspace ${d?.skipped ?? ""} pulado`,
                            description: d?.nextWorkspace
                              ? `Próximo: ${d.nextWorkspace}${d?.partial ? ` · parcial salvo: ${d.partial} cr` : ""}`
                              : "Era o último — pedido finalizado.",
                          });
                          qc.invalidateQueries({ queryKey: ["my-orders", user?.id] });
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Erro";
                          toast({ title: "Falha", description: msg, variant: "destructive" });
                        } finally {
                          setSkipLoading(false);
                        }
                      }}
                    >
                      {skipLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <SkipForward className="w-3.5 h-3.5 mr-1" />}
                      Pular workspace
                    </Button>
                  )}
                  {detail.multi_workspace_mode && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={skipLoading}
                      onClick={async () => {
                        if (!detail) return;
                        const running = Array.isArray(detail.workspaces_plan)
                          ? detail.workspaces_plan.find((w) => w.status === "running")?.name
                          : null;
                        if (!confirm(`Marcar o workspace atual${running ? ` (${running})` : ""} como entregue (200 cr — já atingiu o limite diário) e seguir pro próximo?`)) return;
                        setSkipLoading(true);
                        try {
                          const { data, error } = await supabase.rpc("skip_current_workspace", { _order_id: detail.id, _reason: "already_at_limit" });
                          if (error) throw error;
                          const d = data as { skipped?: string; nextWorkspace?: string | null } | null;
                          toast({
                            title: `Workspace ${d?.skipped ?? ""} marcado como entregue`,
                            description: d?.nextWorkspace
                              ? `Próximo: ${d.nextWorkspace}`
                              : "Era o último — pedido finalizado.",
                          });
                          qc.invalidateQueries({ queryKey: ["my-orders", user?.id] });
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Erro";
                          toast({ title: "Falha", description: msg, variant: "destructive" });
                        } finally {
                          setSkipLoading(false);
                        }
                      }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Já está no limite (200 cr)
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={forceCompleteLoading}
                    onClick={async () => {
                      if (!detail) return;
                      if (!confirm("Forçar conclusão do pedido com o que já foi farmado? O restante será estornado.")) return;
                      setForceCompleteLoading(true);
                      try {
                        const { data, error } = await supabase.rpc("force_complete_order", { _order_id: detail.id });
                        if (error) throw error;
                        const ref = (data as { refunded?: number } | null)?.refunded ?? 0;
                        toast({ title: "Pedido concluído", description: `Estornados ${ref} créditos.` });
                        setDetail(null);
                        qc.invalidateQueries({ queryKey: ["my-orders", user?.id] });
                        qc.invalidateQueries({ queryKey: ["my-bots-mini", user?.id] });
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : "Erro";
                        toast({ title: "Falha", description: msg, variant: "destructive" });
                      } finally {
                        setForceCompleteLoading(false);
                      }
                    }}
                  >
                    {forceCompleteLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5 mr-1" />}
                    Forçar concluído
                  </Button>
                  </div>
                  </>
                  )}
                </div>
              )}
              {detail.is_manual && ["refunded", "failed"].includes(detail.status) && (
                <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                  <div className="text-xs font-medium text-amber-400 flex items-center gap-1">
                    <RotateCw className="w-3.5 h-3.5" /> Tentar farmar novamente
                  </div>
                  {(() => {
                    const botBusy = !!detailBot && detailBot.status === "busy"
                      && !!detailBot.last_heartbeat_at
                      && Date.now() - new Date(detailBot.last_heartbeat_at).getTime() < FARM_ACTIVE_HEARTBEAT_MS;
                    if (!botBusy) return null;
                    return (
                      <div className="text-[11px] text-amber-400">
                        Bot ainda ocupado — aguarde liberar antes de tentar de novo.
                      </div>
                    );
                  })()}
                  {(() => {
                    if (detail.multi_workspace_mode && Array.isArray(detail.workspaces_plan)) {
                      const pending = detail.workspaces_plan.filter((w) => w.status !== "done").length;
                      return (
                        <p className="text-[11px] text-muted-foreground">
                          Vai reprocessar <strong className="text-foreground">{pending} workspace(s)</strong> que ainda
                          não foram concluídos. Re-debita 200 créditos por workspace e tenta atribuir um bot. Se nenhum
                          estiver livre, entra na fila.
                        </p>
                      );
                    }
                    return (
                      <p className="text-[11px] text-muted-foreground">
                        Re-debita os créditos restantes da cota do parceiro e atribui um bot. Se nenhum estiver livre, entra na fila.
                      </p>
                    );
                  })()}
                  <Button
                    size="sm"
                    disabled={retryLoading || (!!detailBot && detailBot.status === "busy" && !!detailBot.last_heartbeat_at && Date.now() - new Date(detailBot.last_heartbeat_at).getTime() < FARM_ACTIVE_HEARTBEAT_MS)}
                    onClick={async () => {
                      if (!detail) return;
                      let confirmMsg = `Re-debitar ${detail.credits} créditos da cota e tentar farmar de novo?`;
                      if (detail.multi_workspace_mode && Array.isArray(detail.workspaces_plan)) {
                        const pending = detail.workspaces_plan.filter((w) => w.status !== "done").length;
                        confirmMsg = `Re-debitar ${pending * 200} créditos e refazer ${pending} workspace(s)?`;
                      }
                      if (!confirm(confirmMsg)) return;
                      setRetryLoading(true);
                      try {
                        const { data, error } = await supabase.functions.invoke(
                          "partner-shop-retry-manual-order",
                          { body: { orderId: detail.id } }
                        );
                        if (error) throw error;
                        const status = (data as { status?: string } | null)?.status;
                        toast({
                          title: "Reprocessando",
                          description:
                            status === "processing"
                              ? "Bot iniciou o farm agora."
                              : status === "queued"
                                ? "Sem bot livre — entrou na fila."
                                : `Status: ${status ?? "ok"}`,
                        });
                        setDetail(null);
                        qc.invalidateQueries({ queryKey: ["my-orders", user?.id] });
                        qc.invalidateQueries({ queryKey: ["my-bots-mini", user?.id] });
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : "Erro";
                        toast({ title: "Falha ao reprocessar", description: msg, variant: "destructive" });
                      } finally {
                        setRetryLoading(false);
                      }
                    }}
                  >
                    {retryLoading ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Reprocessando...</>
                    ) : (
                      <><RotateCw className="w-3.5 h-3.5 mr-1" /> Tentar novamente</>
                    )}
                  </Button>
                  {detail.multi_workspace_mode && Array.isArray(detail.workspaces_plan) &&
                    detail.workspaces_plan.some((w) => w.status === "failed" || w.status === "skipped") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2"
                      disabled={retryFailedLoading || (!!detailBot && detailBot.status === "busy" && !!detailBot.last_heartbeat_at && Date.now() - new Date(detailBot.last_heartbeat_at).getTime() < FARM_ACTIVE_HEARTBEAT_MS)}
                      onClick={async () => {
                        if (!detail || !Array.isArray(detail.workspaces_plan)) return;
                        const failedN = detail.workspaces_plan.filter((w) => w.status === "failed" || w.status === "skipped").length;
                        if (!confirm(`Refazer apenas ${failedN} workspace(s) com falha/ignorados? Re-debita ${failedN * 200} créditos.`)) return;
                        setRetryFailedLoading(true);
                        try {
                          const { data, error } = await supabase.rpc("retry_failed_workspaces_only", { _order_id: detail.id });
                          if (error) throw error;
                          const status = (data as { status?: string } | null)?.status;
                          toast({
                            title: "Reprocessando falhados",
                            description: status === "processing" ? "Bot iniciou agora." : status === "queued" ? "Sem bot livre — fila." : `Status: ${status ?? "ok"}`,
                          });
                          setDetail(null);
                          qc.invalidateQueries({ queryKey: ["my-orders", user?.id] });
                          qc.invalidateQueries({ queryKey: ["my-bots-mini", user?.id] });
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Erro";
                          toast({ title: "Falha", description: msg, variant: "destructive" });
                        } finally {
                          setRetryFailedLoading(false);
                        }
                      }}
                    >
                      {retryFailedLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5 mr-1" />}
                      Refazer só falhados
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ManualOrderDialog open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  );
}
