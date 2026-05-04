import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
  Copy, Eye, EyeOff, MessageCircle, Pencil, Plus, RefreshCw, Search,
  Trash2, Users, Sparkles, Activity, Boxes, CalendarClock, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

type Cliente = {
  id: string;
  nome: string | null;
  whatsapp: string | null;
  email_lovable: string;
  senha_lovable: string;
  farm_auto_ativo: boolean;
  meta_creditos_total: number;
  creditos_farmados_total: number;
  ultimo_farm_sucesso_em: string | null;
  proximo_farm_em: string | null;
  ultimo_erro_farm: string | null;
  workspace_padrao: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
};

const schema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(100, "Máximo 100 caracteres"),
  whatsapp: z.string().trim().min(8, "WhatsApp inválido").max(20, "Máximo 20 caracteres"),
  email_lovable: z.string().trim().email("Email inválido").max(255),
  senha_lovable: z.string().min(4, "Mínimo 4 caracteres").max(200),
  farm_auto_ativo: z.boolean(),
  meta_creditos_total: z.coerce.number().min(0, "Meta inválida").max(10_000_000),
  workspace_padrao: z.string().trim().max(120, "Máximo 120 caracteres").optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function onlyDigits(v: string) {
  return (v ?? "").replace(/\D/g, "");
}
function formatWhats(v: string | null) {
  const d = onlyDigits(v ?? "");
  if (!d) return "-";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length > 11) return `+${d.slice(0, d.length - 11)} (${d.slice(-11, -9)}) ${d.slice(-9, -4)}-${d.slice(-4)}`;
  return d;
}

function fmtNum(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function fmtDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Accounts() {
  const { user, viewAs } = useAuth();
  const [items, setItems] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: "",
      whatsapp: "",
      email_lovable: "",
      senha_lovable: "",
      farm_auto_ativo: true,
      meta_creditos_total: 200,
      workspace_padrao: "",
    },
  });

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("contas_lovable")
      .select("id,nome,whatsapp,email_lovable,senha_lovable,farm_auto_ativo,meta_creditos_total,creditos_farmados_total,ultimo_farm_sucesso_em,proximo_farm_em,ultimo_erro_farm,workspace_padrao,criado_em,atualizado_em")
      .order("criado_em", { ascending: false });
    if (viewAs) q = q.eq("id_do_usuario", viewAs);
    const { data, error } = await q;
    if (error) { toast.error(error.message); setItems([]); }
    else setItems((data as Cliente[]) ?? []);
    setLoading(false);
  };

  const [wsCount, setWsCount] = useState<Record<string, number>>({});
  const loadWsCount = async () => {
    const [resumoRes, contasRes] = await Promise.all([
      supabase.from("resumo_lovable_workspace").select("email_lovable"),
      supabase.from("contas_lovable").select("id,email_lovable"),
    ]);
    const emailToId = new Map<string, string>();
    (contasRes.data ?? []).forEach((c: any) =>
      emailToId.set((c.email_lovable ?? "").toLowerCase(), c.id)
    );
    const map: Record<string, number> = {};
    (resumoRes.data ?? []).forEach((r: any) => {
      const id = emailToId.get((r.email_lovable ?? "").toLowerCase());
      if (id) map[id] = (map[id] ?? 0) + 1;
    });
    setWsCount(map);
  };

  useEffect(() => { load(); loadWsCount(); }, [viewAs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter((i) =>
      [i.nome, i.email_lovable, i.whatsapp].some((v) => (v ?? "").toLowerCase().includes(q))
    );
  }, [items, search]);

  const stats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const last7 = items.filter((c) => c.criado_em && new Date(c.criado_em).getTime() >= weekAgo).length;
    const autoOn = items.filter((c) => c.farm_auto_ativo).length;
    const due = items.filter((c) => c.farm_auto_ativo && c.proximo_farm_em && new Date(c.proximo_farm_em).getTime() <= now).length;
    return { total: items.length, last7, autoOn, due };
  }, [items]);

  const openNew = () => {
    setEditing(null);
    form.reset({
      nome: "",
      whatsapp: "",
      email_lovable: "",
      senha_lovable: "",
      farm_auto_ativo: true,
      meta_creditos_total: 200,
      workspace_padrao: "",
    });
    setOpenForm(true);
  };
  const openEdit = (c: Cliente) => {
    setEditing(c);
    form.reset({
      nome: c.nome ?? "",
      whatsapp: c.whatsapp ?? "",
      email_lovable: c.email_lovable,
      senha_lovable: c.senha_lovable,
      farm_auto_ativo: c.farm_auto_ativo,
      meta_creditos_total: Number(c.meta_creditos_total) || 200,
      workspace_padrao: c.workspace_padrao ?? "",
    });
    setOpenForm(true);
  };

  const onSubmit = async (values: FormValues) => {
    const payload = {
      nome: values.nome,
      whatsapp: onlyDigits(values.whatsapp),
      email_lovable: values.email_lovable,
      senha_lovable: values.senha_lovable,
      farm_auto_ativo: values.farm_auto_ativo,
      meta_creditos_total: values.meta_creditos_total,
      workspace_padrao: values.workspace_padrao?.trim() || null,
    };
    if (editing) {
      const { error } = await supabase.from("contas_lovable").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Cliente atualizado");
    } else {
      if (!user) return toast.error("Sessão expirada");
      const { error } = await supabase.from("contas_lovable").insert([{ ...payload, id_do_usuario: user.id }]);
      if (error) return toast.error(error.message);
      toast.success("Cliente adicionado");
    }
    setOpenForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("contas_lovable").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cliente excluído");
    load();
  };

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copiado`); }
    catch { toast.error("Não foi possível copiar"); }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border neon-border cyber-grid">
        <div className="p-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-primary/80">
              <Sparkles className="h-3.5 w-3.5" /> CRM • Matrix
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-2">
              <span className="neon-text">Clientes</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Gerencie seus clientes e as credenciais Lovable vinculadas. Tudo em um só lugar, rápido e seguro.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Novo cliente
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de clientes</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold tracking-tight">{stats.total}</div></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Últimos 7 dias</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold tracking-tight">{stats.last7}</div></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resultados visíveis</CardTitle>
            <Search className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-semibold tracking-tight">{filtered.length}</div></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Automático ativo</CardTitle>
            <CalendarClock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{stats.autoOn}</div>
            {stats.due > 0 && <div className="text-xs text-amber-500 mt-1">{stats.due} aguardando execução</div>}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Lista de clientes</CardTitle>
              <CardDescription>Busque por nome, WhatsApp ou email</CardDescription>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Email Lovable</TableHead>
                  <TableHead>Senha</TableHead>
                  <TableHead>Agenda</TableHead>
                  <TableHead>Meta</TableHead>
                  <TableHead>Workspaces</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado.</TableCell></TableRow>
                )}
                {filtered.map((c) => {
                  const wa = onlyDigits(c.whatsapp ?? "");
                  const waLink = wa ? `https://wa.me/${wa.length <= 11 ? "55" + wa : wa}` : null;
                  const isShown = !!revealed[c.id];
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nome ?? <span className="text-muted-foreground italic">(sem nome)</span>}</TableCell>
                      <TableCell>
                        {wa ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{formatWhats(c.whatsapp)}</span>
                            <a href={waLink!} target="_blank" rel="noreferrer">
                              <Button variant="ghost" size="icon" className="h-7 w-7"><MessageCircle className="h-3.5 w-3.5" /></Button>
                            </a>
                          </div>
                        ) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{c.email_lovable}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(c.email_lovable, "Email")}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm select-all">
                            {isShown ? c.senha_lovable : "••••••••"}
                          </span>
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setRevealed((r) => ({ ...r, [c.id]: !r[c.id] }))}>
                            {isShown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(c.senha_lovable, "Senha")}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 min-w-[170px]">
                          <Badge variant="outline" className={c.farm_auto_ativo ? "border-primary/40 text-primary" : "text-muted-foreground"}>
                            {c.farm_auto_ativo ? "Auto 24h" : "Manual"}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            {c.proximo_farm_em
                              ? `Próx. ${fmtDateTime(c.proximo_farm_em)}`
                              : c.ultimo_farm_sucesso_em
                                ? `Últ. ${fmtDateTime(c.ultimo_farm_sucesso_em)}`
                                : "Aguardando 1º sucesso"}
                          </div>
                          {c.ultimo_erro_farm && (
                            <div className="text-xs text-destructive flex items-start gap-1">
                              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                              <span className="line-clamp-2">{c.ultimo_erro_farm}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 min-w-[150px]">
                          <div className="text-xs font-mono">
                            +{fmtNum(c.creditos_farmados_total)} / {fmtNum(c.meta_creditos_total)}
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${Math.min(100, ((Number(c.creditos_farmados_total) || 0) / Math.max(Number(c.meta_creditos_total) || 1, 1)) * 100)}%` }}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {c.workspace_padrao ? `Workspace: ${c.workspace_padrao}` : "Sem workspace padrão"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link to={`/dashboard/workspaces?conta=${c.id}`}>
                          <Button variant="outline" size="sm" className="gap-1.5 h-7">
                            <Boxes className="h-3.5 w-3.5 text-primary" />
                            <span className="font-mono">{wsCount[c.id] ?? 0}</span>
                          </Button>
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.criado_em ? new Date(c.criado_em).toLocaleDateString("pt-BR") : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
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
                              <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação remove {c.nome ?? c.email_lovable} permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(c.id)}>Excluir</AlertDialogAction>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            <DialogDescription>
              Salve nome, WhatsApp e a credencial Lovable do cliente.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="nome" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl><Input placeholder="João Silva" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="whatsapp" render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp</FormLabel>
                  <FormControl>
                    <Input placeholder="(11) 99999-9999" inputMode="tel" {...field}
                      onChange={(e) => field.onChange(onlyDigits(e.target.value))}
                      value={formatWhats(field.value)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email_lovable" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Lovable</FormLabel>
                  <FormControl><Input placeholder="cliente@exemplo.com" type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="senha_lovable" render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha Lovable</FormLabel>
                  <FormControl><Input placeholder="••••••••" type="text" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField control={form.control} name="meta_creditos_total" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meta total de créditos</FormLabel>
                    <FormControl><Input type="number" min={0} step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="workspace_padrao" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workspace padrão</FormLabel>
                    <FormControl><Input placeholder="Opcional" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="farm_auto_ativo" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Farm automático</FormLabel>
                    <p className="text-xs text-muted-foreground">Repete a cada 24h depois da última recarga confirmada.</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
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
