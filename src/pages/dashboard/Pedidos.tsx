import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, Search, AlertTriangle, Clock, Loader2, CheckCircle2, Plus, XCircle, RotateCw } from "lucide-react";
import GlitchText from "@/components/landing/GlitchText";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ManualOrderDialog from "@/components/dashboard/ManualOrderDialog";

type OrderStatus = "pending" | "paid" | "queued" | "processing" | "delivered" | "failed" | "expired" | "refunded";

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
  delivered_at: string | null;
  failed_reason: string | null;
  created_at: string;
  raw_payload: Record<string, unknown> | null;
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
  processing: { label: "Processando",          cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  delivered:  { label: "Entregue",             cls: "bg-primary/15 text-primary border-primary/40" },
  failed:     { label: "Falhou",               cls: "bg-destructive/15 text-destructive border-destructive/40" },
  expired:    { label: "Expirado",             cls: "bg-muted text-muted-foreground border-muted-foreground/30" },
  refunded:   { label: "Reembolsado",          cls: "bg-muted text-muted-foreground border-muted-foreground/30" },
};

const STATUSES: OrderStatus[] = ["pending", "paid", "queued", "processing", "delivered", "failed", "expired", "refunded"];

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
      return (data ?? []) as Order[];
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
      (o) => !o.target_workspace && ["paid", "queued", "processing"].includes(o.status)
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
                      {o.target_workspace ?? <span className="text-destructive">— faltando</span>}
                      {wsMissing && (
                        <div className="text-[10px] text-destructive mt-0.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> precisa contato
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{o.credits} cr · {brl(o.amount_cents)}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${meta.cls}`}>
                        {meta.label}
                      </span>
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
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Cliente:</span> {detail.customer_name}</div>
                <div><span className="text-muted-foreground">Email:</span> {detail.customer_email}</div>
                <div><span className="text-muted-foreground">WhatsApp:</span> {detail.customer_whatsapp ?? "—"}</div>
                <div><span className="text-muted-foreground">Workspace:</span> {detail.target_workspace ?? "—"}</div>
                <div><span className="text-muted-foreground">Créditos:</span> {detail.credits}</div>
                <div><span className="text-muted-foreground">Valor:</span> {brl(detail.amount_cents)}</div>
                <div><span className="text-muted-foreground">Tx:</span> <span className="font-mono">{detail.tx_id ?? "—"}</span></div>
                <div><span className="text-muted-foreground">Status:</span> {statusMeta[detail.status].label}</div>
                <div><span className="text-muted-foreground">Pago em:</span> {detail.paid_at ? new Date(detail.paid_at).toLocaleString("pt-BR") : "—"}</div>
                <div><span className="text-muted-foreground">Entregue em:</span> {detail.delivered_at ? new Date(detail.delivered_at).toLocaleString("pt-BR") : "—"}</div>
                <div><span className="text-muted-foreground">Pix expira:</span> {detail.pix_expires_at ? new Date(detail.pix_expires_at).toLocaleString("pt-BR") : "—"}</div>
                <div><span className="text-muted-foreground">Bot:</span> {detail.assigned_bot_id ? (botById.get(detail.assigned_bot_id)?.email_lovable ?? detail.assigned_bot_id) : "—"}</div>
              </div>
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
                    <XCircle className="w-3.5 h-3.5" /> Cancelar recarga manual
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Apenas a parte ainda não farmada será estornada para a cota do parceiro. O que já foi entregue é mantido.
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={cancelLoading}
                    onClick={async () => {
                      if (!detail) return;
                      setCancelLoading(true);
                      try {
                        const { data, error } = await supabase.functions.invoke(
                          "partner-shop-cancel-manual-order",
                          { body: { orderId: detail.id } }
                        );
                        if (error) throw error;
                        const refunded = (data as { refundedCredits?: number } | null)?.refundedCredits ?? 0;
                        toast({ title: "Recarga cancelada", description: `Estornados ${refunded} créditos.` });
                        setDetail(null);
                        qc.invalidateQueries({ queryKey: ["my-orders", user?.id] });
                        qc.invalidateQueries({ queryKey: ["my-bots-mini", user?.id] });
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : "Erro";
                        toast({ title: "Falha ao cancelar", description: msg, variant: "destructive" });
                      } finally {
                        setCancelLoading(false);
                      }
                    }}
                  >
                    {cancelLoading ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Cancelando...</>
                    ) : (
                      <><XCircle className="w-3.5 h-3.5 mr-1" /> Cancelar e estornar</>
                    )}
                  </Button>
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
