import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Trash2, Users, Sparkles, Activity,
} from "lucide-react";
import { toast } from "sonner";

type Cliente = {
  id: string;
  nome: string | null;
  whatsapp: string | null;
  email_lovable: string;
  senha_lovable: string;
  criado_em: string | null;
  atualizado_em: string | null;
};

const schema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(100, "Máximo 100 caracteres"),
  whatsapp: z.string().trim().min(8, "WhatsApp inválido").max(20, "Máximo 20 caracteres"),
  email_lovable: z.string().trim().email("Email inválido").max(255),
  senha_lovable: z.string().min(4, "Mínimo 4 caracteres").max(200),
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

export default function Accounts() {
  const { user } = useAuth();
  const [items, setItems] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", whatsapp: "", email_lovable: "", senha_lovable: "" },
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contas_lovable")
      .select("id,nome,whatsapp,email_lovable,senha_lovable,criado_em,atualizado_em")
      .order("criado_em", { ascending: false });
    if (error) { toast.error(error.message); setItems([]); }
    else setItems((data as Cliente[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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
    return { total: items.length, last7 };
  }, [items]);

  const openNew = () => { setEditing(null); form.reset({ nome: "", whatsapp: "", email_lovable: "", senha_lovable: "" }); setOpenForm(true); };
  const openEdit = (c: Cliente) => {
    setEditing(c);
    form.reset({
      nome: c.nome ?? "",
      whatsapp: c.whatsapp ?? "",
      email_lovable: c.email_lovable,
      senha_lovable: c.senha_lovable,
    });
    setOpenForm(true);
  };

  const onSubmit = async (values: FormValues) => {
    const payload = { ...values, whatsapp: onlyDigits(values.whatsapp) };
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

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado.</TableCell></TableRow>
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
