import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Boxes, RefreshCw, Search, Trash2, Sparkles, Activity, CheckCircle2,
  AlertTriangle, Coins, AlertCircle, History, TrendingUp, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { cleanWorkspaceName } from "@/lib/workspace-name";

type Resumo = {
  id: string;
  id_do_usuario: string;
  email_lovable: string;
  workspace_nome: string;
  total_execucoes: number;
  total_sucessos: number;
  total_limites: number;
  total_falhas: number;
  total_creditos_farmados: number;
  ultimo_creditos_finais: number | null;
  ultima_execucao_status: string | null;
  atualizado_em: string;
  criado_em: string;
};

type Conta = { id: string; nome: string | null; email_lovable: string };

type Execucao = {
  id: string;
  status: string;
  creditos_iniciais: number | null;
  creditos_adicionados: number;
  creditos_finais: number | null;
  erro: string | null;
  iniciado_em: string;
  finalizado_em: string | null;
};

const statusMeta: Record<string, { label: string; cls: string; Icon: typeof Activity }> = {
  em_andamento: { label: "Em andamento", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", Icon: Activity },
  concluido: { label: "Sucesso", cls: "bg-primary/15 text-primary border-primary/40", Icon: CheckCircle2 },
  sucesso: { label: "Sucesso", cls: "bg-primary/15 text-primary border-primary/40", Icon: CheckCircle2 },
  limite: { label: "Limite", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30", Icon: AlertCircle },
  erro: { label: "Erro", cls: "bg-destructive/15 text-destructive border-destructive/40", Icon: AlertTriangle },
  falha: { label: "Falha", cls: "bg-destructive/15 text-destructive border-destructive/40", Icon: AlertTriangle },
};

function statusInfo(s: string | null) {
  if (!s) return { label: "—", cls: "bg-muted text-muted-foreground border-border", Icon: Activity };
  return statusMeta[s] ?? { label: s, cls: "bg-muted text-muted-foreground border-border", Icon: Activity };
}

function fmtNum(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export default function Workspaces() {
  const { viewAs } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Resumo[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [contaFilter, setContaFilter] = useState<string>(params.get("conta") ?? "todas");

  const [openHist, setOpenHist] = useState(false);
  const [histItem, setHistItem] = useState<Resumo | null>(null);
  const [histRows, setHistRows] = useState<Execucao[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    let rQ = supabase
      .from("resumo_lovable_workspace")
      .select("*")
      .order("atualizado_em", { ascending: false });
    let cQ = supabase
      .from("contas_lovable")
      .select("id,nome,email_lovable")
      .order("nome", { ascending: true });
    if (viewAs) {
      rQ = rQ.eq("id_do_usuario", viewAs);
      cQ = cQ.eq("id_do_usuario", viewAs);
    }
    const [rRes, cRes] = await Promise.all([rQ, cQ]);
    if (rRes.error) toast.error(rRes.error.message);
    if (cRes.error) toast.error(cRes.error.message);
    setItems((rRes.data as Resumo[]) ?? []);
    setContas((cRes.data as Conta[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [viewAs]);

  const contasByEmail = useMemo(() => {
    const m = new Map<string, Conta>();
    contas.forEach((c) => m.set(c.email_lovable.toLowerCase(), c));
    return m;
  }, [contas]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const matchStatus = (s: string | null) => {
      if (statusFilter === "todos") return true;
      const cur = s ?? "";
      if (statusFilter === "erro") return cur === "erro" || cur === "falha";
      if (statusFilter === "concluido") return cur === "concluido" || cur === "sucesso";
      return cur === statusFilter;
    };
    return items.filter((w) => {
      if (!matchStatus(w.ultima_execucao_status)) return false;
      if (contaFilter !== "todas") {
        const c = contasByEmail.get(w.email_lovable.toLowerCase());
        if (!c || c.id !== contaFilter) return false;
      }
      if (!q) return true;
      const c = contasByEmail.get(w.email_lovable.toLowerCase());
      return [w.workspace_nome, w.email_lovable, c?.nome].some((v) =>
        (v ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, statusFilter, contaFilter, contasByEmail]);

  const stats = useMemo(() => {
    const total = items.length;
    const comErro = items.filter((i) => i.ultima_execucao_status === "erro" || i.ultima_execucao_status === "falha").length;
    const execucoes = items.reduce((s, i) => s + (Number(i.total_execucoes) || 0), 0);
    const creditos = items.reduce((s, i) => s + (Number(i.total_creditos_farmados) || 0), 0);
    return { total, comErro, execucoes, creditos };
  }, [items]);

  const openHistory = async (w: Resumo) => {
    setHistItem(w);
    setOpenHist(true);
    setHistLoading(true);
    const { data, error } = await supabase
      .from("execucoes_lovable")
      .select("id,status,creditos_iniciais,creditos_adicionados,creditos_finais,erro,iniciado_em,finalizado_em")
      .eq("email_lovable", w.email_lovable)
      .eq("workspace_nome", w.workspace_nome)
      .order("iniciado_em", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    setHistRows((data as Execucao[]) ?? []);
    setHistLoading(false);
  };

  const handleDelete = async (w: Resumo) => {
    const { error } = await supabase.from("resumo_lovable_workspace").delete().eq("id", w.id);
    if (error) return toast.error(error.message);
    toast.success("Workspace removido do resumo");
    load();
  };

  const clearContaFilter = () => {
    setContaFilter("todas");
    if (params.get("conta")) {
      params.delete("conta");
      setParams(params, { replace: true });
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border neon-border cyber-grid">
        <div className="p-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-primary/80">
              <Sparkles className="h-3.5 w-3.5" /> CRM • Workspaces
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-2">
              <span className="neon-text">Workspaces</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Um workspace por linha. Veja status, créditos farmados e o histórico completo de execuções de cada um.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Workspaces</CardTitle>
            <Boxes className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold tracking-tight">{stats.total}</div></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Com erro no último farm</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold tracking-tight">{stats.comErro}</div></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Execuções totais</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold tracking-tight">{fmtNum(stats.execucoes)}</div></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Créditos farmados</CardTitle>
            <Coins className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold tracking-tight">{fmtNum(stats.creditos)}</div></CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Lista de workspaces</CardTitle>
              <CardDescription>Clique em uma linha para ver o histórico completo de execuções</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Último status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos status</SelectItem>
                  <SelectItem value="concluido">Sucesso</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="limite">Limite</SelectItem>
                  <SelectItem value="erro">Erro</SelectItem>
                </SelectContent>
              </Select>
              <Select value={contaFilter} onValueChange={(v) => { setContaFilter(v); if (v === "todas") clearContaFilter(); }}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todos os clientes</SelectItem>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome ?? c.email_lovable}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-64">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Último status</TableHead>
                  <TableHead>Execuções</TableHead>
                  <TableHead className="text-right">Créditos farmados</TableHead>
                  <TableHead className="text-right">Saldo atual</TableHead>
                  <TableHead>Atualizado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum workspace encontrado.</TableCell></TableRow>
                )}
                {filtered.map((w) => {
                  const conta = contasByEmail.get(w.email_lovable.toLowerCase());
                  const st = statusInfo(w.ultima_execucao_status);
                  const StIcon = st.Icon;
                  return (
                    <TableRow
                      key={w.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => openHistory(w)}
                    >
                      <TableCell className="font-medium">{w.workspace_nome}</TableCell>
                      <TableCell>
                        {conta ? (
                          <div className="leading-tight">
                            <div className="font-medium">{conta.nome ?? "—"}</div>
                            <div className="text-xs text-muted-foreground font-mono">{conta.email_lovable}</div>
                          </div>
                        ) : (
                          <div className="leading-tight">
                            <div className="text-muted-foreground italic">Sem cliente vinculado</div>
                            <div className="text-xs text-muted-foreground font-mono">{w.email_lovable}</div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${st.cls}`}>
                          <StIcon className="h-3 w-3" /> {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-muted-foreground">{w.total_execucoes}</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-0.5 text-primary">
                                    <CheckCircle2 className="h-3 w-3" />{w.total_sucessos}
                                  </span>
                                  <span className="inline-flex items-center gap-0.5 text-blue-400">
                                    <AlertCircle className="h-3 w-3" />{w.total_limites}
                                  </span>
                                  <span className="inline-flex items-center gap-0.5 text-destructive">
                                    <AlertTriangle className="h-3 w-3" />{w.total_falhas}
                                  </span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Sucessos · Limites · Falhas
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-primary">
                        +{fmtNum(w.total_creditos_farmados)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {w.ultimo_creditos_finais != null ? fmtNum(w.ultimo_creditos_finais) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(w.atualizado_em).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => openHistory(w)} title="Ver histórico">
                          <History className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover este workspace do resumo?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Remove "{w.workspace_nome}" do painel. As execuções históricas em <code>execucoes_lovable</code> permanecem.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(w)}>Remover</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={openHist} onOpenChange={setOpenHist}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-primary" />
              {histItem?.workspace_nome}
            </SheetTitle>
            <SheetDescription className="font-mono text-xs">
              {histItem?.email_lovable}
            </SheetDescription>
          </SheetHeader>

          {histItem && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                      <Coins className="h-3 w-3" /> Créditos farmados
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 pb-3">
                    <div className="text-xl font-semibold text-primary">+{fmtNum(histItem.total_creditos_farmados)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                      <Wallet className="h-3 w-3" /> Saldo atual
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 pb-3">
                    <div className="text-xl font-semibold">{histItem.ultimo_creditos_finais != null ? fmtNum(histItem.ultimo_creditos_finais) : "—"}</div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Sucessos</div>
                  <div className="text-lg font-semibold text-primary">{histItem.total_sucessos}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Limites</div>
                  <div className="text-lg font-semibold text-blue-400">{histItem.total_limites}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Falhas</div>
                  <div className="text-lg font-semibold text-destructive">{histItem.total_falhas}</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2 flex items-center gap-2">
                  <History className="h-4 w-4" /> Últimas execuções
                </div>
                {histLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}
                {!histLoading && histRows.length === 0 && (
                  <div className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                    Nenhuma execução registrada.
                  </div>
                )}
                <ul className="divide-y border rounded-md">
                  {histRows.map((e) => {
                    const st = statusInfo(e.status);
                    const StIcon = st.Icon;
                    return (
                      <li key={e.id} className="p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className={`gap-1 ${st.cls}`}>
                            <StIcon className="h-3 w-3" /> {st.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(e.iniciado_em).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-muted-foreground">
                          {e.creditos_iniciais ?? "—"} → {e.creditos_finais ?? "—"}
                          <span className="text-primary ml-2">+{fmtNum(e.creditos_adicionados)}</span>
                        </div>
                        {e.erro && (
                          <div className="text-xs text-destructive mt-1 flex items-start gap-1">
                            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="break-words">{e.erro}</span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {(() => {
                const conta = contasByEmail.get(histItem.email_lovable.toLowerCase());
                return conta ? (
                  <Link to={`/dashboard/accounts`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    Ver cliente: {conta.nome ?? conta.email_lovable}
                  </Link>
                ) : null;
              })()}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}