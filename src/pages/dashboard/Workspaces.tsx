import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Boxes, Pencil, Plus, RefreshCw, Search, Trash2, Sparkles,
  Activity, CheckCircle2, AlertTriangle, Coins, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

type Status = "em_andamento" | "concluido" | "erro";

type Workspace = {
  id: string;
  workspace_nome: string | null;
  email_lovable: string;
  conta_id: string | null;
  creditos_iniciais: number | null;
  creditos_adicionados: number;
  creditos_finais: number | null;
  status: string;
  erro: string | null;
  iniciado_em: string;
  finalizado_em: string | null;
};

type Conta = {
  id: string;
  nome: string | null;
  email_lovable: string;
};

const schema = z.object({
  workspace_nome: z.string().trim().min(1, "Nome obrigatório").max(120),
  conta_id: z.string().min(1, "Selecione uma conta"),
  status: z.enum(["em_andamento", "concluido", "erro"]),
  creditos_iniciais: z.string().optional(),
  creditos_adicionados: z.string().optional(),
  creditos_finais: z.string().optional(),
  erro: z.string().optional(),
  iniciado_em: z.string().optional(),
  finalizado_em: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const statusMeta: Record<Status, { label: string; cls: string; Icon: typeof Activity }> = {
  em_andamento: { label: "Em andamento", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", Icon: Activity },
  concluido: { label: "Concluído", cls: "bg-primary/15 text-primary border-primary/40", Icon: CheckCircle2 },
  erro: { label: "Erro", cls: "bg-destructive/15 text-destructive border-destructive/40", Icon: AlertTriangle },
};

function toNum(v?: string): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toLocal(dt: string | null | undefined) {
  if (!dt) return "";
  const d = new Date(dt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDuration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}min` : `${m}min`;
}

export default function Workspaces() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Workspace[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [contaFilter, setContaFilter] = useState<string>(params.get("conta") ?? "todas");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      workspace_nome: "", conta_id: "", status: "em_andamento",
      creditos_iniciais: "", creditos_adicionados: "0", creditos_finais: "",
      erro: "", iniciado_em: toLocal(new Date().toISOString()), finalizado_em: "",
    },
  });

  const watchStatus = form.watch("status");

  const load = async () => {
    setLoading(true);
    const [wRes, cRes] = await Promise.all([
      supabase.from("execucoes_lovable").select("*").order("iniciado_em", { ascending: false }),
      supabase.from("contas_lovable").select("id,nome,email_lovable").order("nome", { ascending: true }),
    ]);
    if (wRes.error) toast.error(wRes.error.message);
    if (cRes.error) toast.error(cRes.error.message);
    setItems((wRes.data as Workspace[]) ?? []);
    setContas((cRes.data as Conta[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const c = params.get("conta");
    if (c) setContaFilter(c);
  }, [params]);

  const contasMap = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((w) => {
      if (statusFilter !== "todos" && w.status !== statusFilter) return false;
      if (contaFilter !== "todas" && w.conta_id !== contaFilter) return false;
      if (!q) return true;
      const conta = w.conta_id ? contasMap.get(w.conta_id) : null;
      return [w.workspace_nome, w.email_lovable, conta?.nome].some((v) =>
        (v ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, statusFilter, contaFilter, contasMap]);

  const stats = useMemo(() => {
    const total = items.length;
    const ativos = items.filter((i) => i.status === "em_andamento").length;
    const concluidos = items.filter((i) => i.status === "concluido").length;
    const creditos = items.reduce((s, i) => s + (Number(i.creditos_adicionados) || 0), 0);
    return { total, ativos, concluidos, creditos };
  }, [items]);

  const openNew = () => {
    setEditing(null);
    form.reset({
      workspace_nome: "", conta_id: contaFilter !== "todas" ? contaFilter : "",
      status: "em_andamento",
      creditos_iniciais: "", creditos_adicionados: "0", creditos_finais: "",
      erro: "", iniciado_em: toLocal(new Date().toISOString()), finalizado_em: "",
    });
    setOpenForm(true);
  };

  const openEdit = (w: Workspace) => {
    setEditing(w);
    form.reset({
      workspace_nome: w.workspace_nome ?? "",
      conta_id: w.conta_id ?? "",
      status: (w.status as Status) ?? "em_andamento",
      creditos_iniciais: w.creditos_iniciais?.toString() ?? "",
      creditos_adicionados: (w.creditos_adicionados ?? 0).toString(),
      creditos_finais: w.creditos_finais?.toString() ?? "",
      erro: w.erro ?? "",
      iniciado_em: toLocal(w.iniciado_em),
      finalizado_em: toLocal(w.finalizado_em),
    });
    setOpenForm(true);
  };

  const onSubmit = async (values: FormValues) => {
    if (!user) return toast.error("Sessão expirada");
    const conta = contas.find((c) => c.id === values.conta_id);
    if (!conta) return toast.error("Conta inválida");

    const payload = {
      workspace_nome: values.workspace_nome,
      conta_id: values.conta_id,
      email_lovable: conta.email_lovable,
      status: values.status,
      creditos_iniciais: toNum(values.creditos_iniciais),
      creditos_adicionados: toNum(values.creditos_adicionados) ?? 0,
      creditos_finais: toNum(values.creditos_finais),
      erro: values.status === "erro" ? (values.erro || null) : null,
      iniciado_em: values.iniciado_em ? new Date(values.iniciado_em).toISOString() : new Date().toISOString(),
      finalizado_em: values.finalizado_em ? new Date(values.finalizado_em).toISOString() : null,
    };

    if (editing) {
      const { error } = await supabase.from("execucoes_lovable").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Workspace atualizado");
    } else {
      const { error } = await supabase.from("execucoes_lovable").insert([{ ...payload, id_do_usuario: user.id }]);
      if (error) return toast.error(error.message);
      toast.success("Workspace adicionado");
    }
    setOpenForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("execucoes_lovable").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Workspace excluído");
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
              Controle todos os workspaces Lovable vinculados aos seus clientes — créditos, status e histórico em tempo real.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Novo workspace
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            <Boxes className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold tracking-tight">{stats.total}</div></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Em andamento</CardTitle>
            <Activity className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold tracking-tight">{stats.ativos}</div></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Concluídos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold tracking-tight">{stats.concluidos}</div></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Créditos adicionados</CardTitle>
            <Coins className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">
              {stats.creditos.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Lista de workspaces</CardTitle>
              <CardDescription>Filtre por cliente, status ou pesquise pelo nome</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos status</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
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
                  <TableHead>Status</TableHead>
                  <TableHead>Créditos</TableHead>
                  <TableHead>Início → Fim</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum workspace encontrado.</TableCell></TableRow>
                )}
                {filtered.map((w) => {
                  const conta = w.conta_id ? contasMap.get(w.conta_id) : null;
                  const st = (statusMeta[w.status as Status] ?? statusMeta.em_andamento);
                  const StIcon = st.Icon;
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium">
                        {w.workspace_nome ?? <span className="text-muted-foreground italic">(sem nome)</span>}
                      </TableCell>
                      <TableCell>
                        {conta ? (
                          <Link to={`/dashboard/accounts`} className="hover:underline">
                            <div className="leading-tight">
                              <div className="font-medium">{conta.nome ?? "—"}</div>
                              <div className="text-xs text-muted-foreground font-mono">{conta.email_lovable}</div>
                            </div>
                          </Link>
                        ) : (
                          <div className="leading-tight">
                            <div className="text-muted-foreground italic">Sem cliente</div>
                            <div className="text-xs text-muted-foreground font-mono">{w.email_lovable}</div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${st.cls}`}>
                          <StIcon className="h-3 w-3" /> {st.label}
                        </Badge>
                        {w.status === "erro" && w.erro && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertCircle className="h-3.5 w-3.5 text-destructive inline ml-2" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">{w.erro}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <div>{w.creditos_iniciais ?? "—"} → {w.creditos_finais ?? "—"}</div>
                        <div className="text-primary">+{Number(w.creditos_adicionados ?? 0)}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div>{new Date(w.iniciado_em).toLocaleString("pt-BR")}</div>
                        <div>{w.finalizado_em ? new Date(w.finalizado_em).toLocaleString("pt-BR") : "em curso"}</div>
                      </TableCell>
                      <TableCell className="text-xs">{fmtDuration(w.iniciado_em, w.finalizado_em)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(w)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir workspace?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação remove "{w.workspace_nome ?? w.email_lovable}" permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(w.id)}>Excluir</AlertDialogAction>
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

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar workspace" : "Novo workspace"}</DialogTitle>
            <DialogDescription>
              Vincule o workspace a uma conta Lovable do seu cliente.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="workspace_nome" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do workspace</FormLabel>
                  <FormControl><Input placeholder="meu-projeto" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="conta_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Conta Lovable (cliente)</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contas.length === 0 && (
                        <div className="px-2 py-3 text-xs text-muted-foreground">Cadastre um cliente primeiro</div>
                      )}
                      {contas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {(c.nome ?? "—") + " · " + c.email_lovable}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                      <SelectItem value="erro">Erro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="creditos_iniciais" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Créd. iniciais</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="creditos_adicionados" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adicionados</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="creditos_finais" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Finais</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="iniciado_em" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Iniciado em</FormLabel>
                    <FormControl><Input type="datetime-local" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="finalizado_em" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Finalizado em</FormLabel>
                    <FormControl><Input type="datetime-local" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {watchStatus === "erro" && (
                <FormField control={form.control} name="erro" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Detalhes do erro</FormLabel>
                    <FormControl><Textarea rows={3} placeholder="Mensagem ou contexto do erro" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {editing ? "Salvar" : "Adicionar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}