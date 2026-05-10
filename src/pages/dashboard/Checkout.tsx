import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Search, Copy, Loader2 } from "lucide-react";
import GlitchText from "@/components/landing/GlitchText";
import { useToast } from "@/hooks/use-toast";

type Source = "all" | "partner" | "pix";

type Item = {
  id: string;
  source: "partner_order" | "pix_charge";
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_whatsapp: string | null;
  partner_id: string | null;
  partner_name: string | null;
  amount_cents: number | null;
  credits: number | null;
  created_at: string;
  paid_at: string | null;
  pix_expires_at: string | null;
  tx_id: string | null;
  raw: Record<string, unknown>;
};

type ListResponse = {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
  totals: { count: number; grossCents: number; paidCents: number; pendingCents: number; failedCount: number };
};

type EventRow = {
  id: string;
  event_type: string;
  status_before: string | null;
  status_after: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:        { label: "Aguardando",   cls: "bg-muted text-muted-foreground border-muted-foreground/30" },
  pix_generated:  { label: "PIX gerado",   cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  paid:           { label: "Pago",         cls: "bg-primary/15 text-primary border-primary/40" },
  processing:     { label: "Processando",  cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  queued:         { label: "Na fila",      cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  delivered:      { label: "Entregue",     cls: "bg-primary/15 text-primary border-primary/40" },
  failed:         { label: "Falhou",       cls: "bg-destructive/15 text-destructive border-destructive/40" },
  canceled:       { label: "Cancelado",    cls: "bg-destructive/15 text-destructive border-destructive/40" },
  expired:        { label: "Expirado",     cls: "bg-muted text-muted-foreground border-muted-foreground/30" },
  refunded:       { label: "Estornado",    cls: "bg-muted text-muted-foreground border-muted-foreground/30" },
};

function fmtCents(c: number | null) {
  if (c == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR");
}

export default function Checkout() {
  const { toast } = useToast();
  const [source, setSource] = useState<Source>("all");
  const [status, setStatus] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [detailFor, setDetailFor] = useState<Item | null>(null);

  // debounce
  useMemo(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery<ListResponse>({
    queryKey: ["admin-checkout", source, status, from, to, qDebounced, page],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-checkout-list", {
        body: { source, status, from: from || null, to: to || null, q: qDebounced, page, pageSize },
      });
      if (error) throw error;
      return data as ListResponse;
    },
  });

  const detail = useQuery<{ events: EventRow[]; record: Record<string, unknown> | null }>({
    queryKey: ["admin-checkout-events", detailFor?.source, detailFor?.id],
    enabled: !!detailFor,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-checkout-events", {
        body: { source: detailFor!.source, sourceId: detailFor!.id },
      });
      if (error) throw error;
      return data as { events: EventRow[]; record: Record<string, unknown> | null };
    },
  });

  const totals = list.data?.totals;
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const copy = (label: string, value: string | null) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    toast({ title: "Copiado", description: `${label}: ${value}` });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-mono uppercase tracking-wider text-primary">
            <GlitchText>Checkout</GlitchText>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Todos os pagamentos da plataforma — parceiros e loja.
          </p>
        </div>
        <Receipt className="h-8 w-8 text-primary/60" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Faturado" value={fmtCents(totals?.grossCents ?? 0)} />
        <StatCard label="Pago" value={fmtCents(totals?.paidCents ?? 0)} />
        <StatCard label="Pendente" value={fmtCents(totals?.pendingCents ?? 0)} />
        <StatCard label="Falhas/Cancelados" value={String(totals?.failedCount ?? 0)} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono uppercase tracking-wider text-primary/80">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <Select value={source} onValueChange={(v) => { setSource(v as Source); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                <SelectItem value="partner">Parceiros</SelectItem>
                <SelectItem value="pix">Loja / Licenças</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pending">Aguardando</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="processing">Processando</SelectItem>
                <SelectItem value="queued">Na fila</SelectItem>
                <SelectItem value="delivered">Entregue</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
                <SelectItem value="expired">Expirado</SelectItem>
                <SelectItem value="refunded">Estornado</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            <div className="md:col-span-2 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="Buscar por email, nome ou whatsapp"
                className="pl-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="p-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum pagamento encontrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Parceiro</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Créditos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const meta = STATUS_LABEL[it.status] ?? { label: it.status, cls: "bg-muted text-muted-foreground border-muted-foreground/30" };
                  return (
                    <TableRow key={`${it.source}:${it.id}`}>
                      <TableCell className="whitespace-nowrap text-xs">{fmtDate(it.created_at)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{it.customer_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{it.customer_email || "—"}</div>
                        {it.customer_whatsapp && (
                          <div className="text-xs text-muted-foreground">{it.customer_whatsapp}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {it.source === "partner_order" ? "Parceiro" : "Loja"}
                      </TableCell>
                      <TableCell className="text-xs">{it.partner_name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{fmtCents(it.amount_cents)}</TableCell>
                      <TableCell className="font-mono text-xs">{it.credits ?? "—"}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wider ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setDetailFor(it)}>
                          Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Página {page} de {totalPages} · {total} registros
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!detailFor} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do pagamento</DialogTitle>
          </DialogHeader>
          {detailFor && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Cliente" value={detailFor.customer_name || "—"} />
                <Info label="Origem" value={detailFor.source === "partner_order" ? "Parceiro" : "Loja"} />
                <Info
                  label="Email"
                  value={detailFor.customer_email || "—"}
                  onCopy={() => copy("Email", detailFor.customer_email)}
                />
                <Info
                  label="WhatsApp"
                  value={detailFor.customer_whatsapp || "—"}
                  onCopy={() => copy("WhatsApp", detailFor.customer_whatsapp)}
                />
                <Info label="Valor" value={fmtCents(detailFor.amount_cents)} />
                <Info label="Créditos" value={detailFor.credits != null ? String(detailFor.credits) : "—"} />
                <Info label="Criado em" value={fmtDate(detailFor.created_at)} />
                <Info label="Pago em" value={fmtDate(detailFor.paid_at)} />
                <Info label="TX ID" value={detailFor.tx_id || "—"} />
                <Info label="Parceiro" value={detailFor.partner_name || "—"} />
              </div>

              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-primary/80 mb-2">
                  Linha do tempo
                </h4>
                {detail.isLoading ? (
                  <div className="text-xs text-muted-foreground">Carregando eventos…</div>
                ) : (detail.data?.events?.length ?? 0) === 0 ? (
                  <div className="text-xs text-muted-foreground">Sem eventos registrados.</div>
                ) : (
                  <ul className="space-y-2">
                    {detail.data!.events.map((e) => (
                      <li key={e.id} className="border-l-2 border-primary/30 pl-3">
                        <div className="text-xs font-mono uppercase text-primary">{e.event_type}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(e.created_at)}</div>
                        {e.status_before || e.status_after ? (
                          <div className="text-xs">
                            {e.status_before ?? "—"} → {e.status_after ?? "—"}
                          </div>
                        ) : null}
                        {e.metadata && Object.keys(e.metadata).length > 0 && (
                          <pre className="text-[10px] text-muted-foreground bg-muted/40 rounded p-2 mt-1 overflow-x-auto">
                            {JSON.stringify(e.metadata, null, 2)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {detail.data?.record && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-primary">
                    Payload completo
                  </summary>
                  <pre className="text-[10px] bg-muted/40 rounded p-2 mt-2 overflow-x-auto">
                    {JSON.stringify(detail.data.record, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-bold text-primary mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <div className="text-sm break-all">{value}</div>
        {onCopy && value !== "—" && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-primary" title="Copiar">
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}