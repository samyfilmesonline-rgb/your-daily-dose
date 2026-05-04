import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Handshake, Search, RefreshCw, Check, Ban, Play, Eye, Pencil, Trash2,
  Clock, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

type Parceiro = {
  user_id: string;
  nome: string | null;
  whatsapp: string | null;
  status: "pendente" | "ativo" | "suspenso";
  limite_clientes: number;
  limite_workspaces: number;
  limite_creditos: number;
  creditos_consumidos: number;
  criado_em: string;
  aprovado_em: string | null;
};

type Profile = { id: string; email: string };

const statusMeta = {
  pendente:  { label: "Pendente",  cls: "bg-amber-500/15 text-amber-500 border-amber-500/30",   Icon: Clock },
  ativo:     { label: "Ativo",     cls: "bg-primary/15 text-primary border-primary/40",          Icon: CheckCircle2 },
  suspenso:  { label: "Suspenso",  cls: "bg-destructive/15 text-destructive border-destructive/40", Icon: AlertTriangle },
};

export default function Partners() {
  const navigate = useNavigate();
  const { user, setViewAs } = useAuth();
  const [items, setItems] = useState<Parceiro[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [counts, setCounts] = useState<Record<string, { clientes: number; workspaces: number }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Parceiro | null>(null);
  const [form, setForm] = useState({ limite_clientes: 50, limite_workspaces: 100, limite_creditos: 1000 });

  const load = async () => {
    setLoading(true);
    const [pRes, prRes, cRes, wRes] = await Promise.all([
      supabase.from("parceiros").select("*").order("criado_em", { ascending: false }),
      supabase.from("profiles").select("id,email"),
      supabase.from("contas_lovable").select("id_do_usuario"),
      supabase.from("resumo_lovable_workspace").select("id_do_usuario"),
    ]);
    if (pRes.error) toast.error(pRes.error.message);
    setItems((pRes.data as Parceiro[]) ?? []);
    const m = new Map<string, string>();
    (prRes.data as Profile[] | null)?.forEach((p) => m.set(p.id, p.email));
    setProfiles(m);
    const c: Record<string, { clientes: number; workspaces: number }> = {};
    (cRes.data ?? []).forEach((r: any) => {
      c[r.id_do_usuario] ??= { clientes: 0, workspaces: 0 };
      c[r.id_do_usuario].clientes++;
    });
    (wRes.data ?? []).forEach((r: any) => {
      c[r.id_do_usuario] ??= { clientes: 0, workspaces: 0 };
      c[r.id_do_usuario].workspaces++;
    });
    setCounts(c);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter((p) =>
      [p.nome, profiles.get(p.user_id), p.whatsapp].some((v) => (v ?? "").toLowerCase().includes(q))
    );
  }, [items, search, profiles]);

  const stats = useMemo(() => ({
    total: items.length,
    pendentes: items.filter((p) => p.status === "pendente").length,
    ativos: items.filter((p) => p.status === "ativo").length,
    suspensos: items.filter((p) => p.status === "suspenso").length,
  }), [items]);

  const setStatus = async (p: Parceiro, status: Parceiro["status"]) => {
    const patch: any = { status };
    if (status === "ativo" && !p.aprovado_em) {
      patch.aprovado_em = new Date().toISOString();
      patch.aprovado_por = user?.id;
    }
    const { error } = await supabase.from("parceiros").update(patch).eq("user_id", p.user_id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
    load();
  };

  const handleDelete = async (p: Parceiro) => {
    const { error } = await supabase.from("parceiros").delete().eq("user_id", p.user_id);
    if (error) return toast.error(error.message);
    toast.success("Parceiro removido");
    load();
  };

  const openEdit = (p: Parceiro) => {
    setEditing(p);
    setForm({
      limite_clientes: p.limite_clientes,
      limite_workspaces: p.limite_workspaces,
      limite_creditos: Number(p.limite_creditos),
    });
  };

  const saveQuotas = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("parceiros")
      .update({
        limite_clientes: form.limite_clientes,
        limite_workspaces: form.limite_workspaces,
        limite_creditos: form.limite_creditos,
      })
      .eq("user_id", editing.user_id);
    if (error) return toast.error(error.message);
    toast.success("Cotas atualizadas");
    setEditing(null);
    load();
  };

  const verComo = (p: Parceiro) => {
    setViewAs(p.user_id);
    navigate("/dashboard");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-primary/80">
            <Handshake className="h-3.5 w-3.5" /> Admin • Parceiros
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mt-2">Parceiros</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Aprove novos parceiros, defina cotas e acompanhe o consumo de cada um.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Total",     v: stats.total,     I: Handshake },
          { l: "Pendentes", v: stats.pendentes, I: Clock },
          { l: "Ativos",    v: stats.ativos,    I: CheckCircle2 },
          { l: "Suspensos", v: stats.suspensos, I: AlertTriangle },
        ].map((s) => (
          <Card key={s.l}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.l}</CardTitle>
              <s.I className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-3xl font-semibold tracking-tight">{s.v}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Lista de parceiros</CardTitle>
              <CardDescription>Aprove pendentes e gerencie cotas e status</CardDescription>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou email..." className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parceiro</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Clientes</TableHead>
                  <TableHead className="text-right">Workspaces</TableHead>
                  <TableHead>Créditos</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum parceiro encontrado.</TableCell></TableRow>
                )}
                {filtered.map((p) => {
                  const meta = statusMeta[p.status];
                  const Icon = meta.Icon;
                  const used = Number(p.creditos_consumidos) || 0;
                  const max = Number(p.limite_creditos) || 0;
                  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
                  const c = counts[p.user_id] ?? { clientes: 0, workspaces: 0 };
                  return (
                    <TableRow key={p.user_id}>
                      <TableCell>
                        <div className="leading-tight">
                          <div className="font-medium">{p.nome ?? <span className="text-muted-foreground italic">(sem nome)</span>}</div>
                          <div className="text-xs text-muted-foreground font-mono">{profiles.get(p.user_id) ?? p.user_id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
                          <Icon className="h-3 w-3" /> {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.clientes} <span className="text-muted-foreground text-xs">/ {p.limite_clientes}</span></TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.workspaces} <span className="text-muted-foreground text-xs">/ {p.limite_workspaces}</span></TableCell>
                      <TableCell className="min-w-[160px]">
                        <div className="text-xs font-mono mb-1">
                          {used.toLocaleString("pt-BR")} / {max.toLocaleString("pt-BR")}
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.criado_em).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {p.status === "pendente" && (
                            <Button size="icon" variant="ghost" title="Aprovar" onClick={() => setStatus(p, "ativo")}>
                              <Check className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          {p.status === "ativo" && (
                            <Button size="icon" variant="ghost" title="Suspender" onClick={() => setStatus(p, "suspenso")}>
                              <Ban className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                          {p.status === "suspenso" && (
                            <Button size="icon" variant="ghost" title="Reativar" onClick={() => setStatus(p, "ativo")}>
                              <Play className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" title="Ver como" onClick={() => verComo(p)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Editar cotas" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="text-destructive" title="Excluir">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover parceiro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Isso remove o parceiro do painel. O usuário continua existindo no Auth, mas perde acesso ao sistema.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(p)}>Remover</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar cotas</DialogTitle>
            <DialogDescription>
              {editing?.nome ?? profiles.get(editing?.user_id ?? "") ?? ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Limite de clientes</Label>
              <Input type="number" min={0} value={form.limite_clientes}
                onChange={(e) => setForm((f) => ({ ...f, limite_clientes: Number(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Limite de workspaces</Label>
              <Input type="number" min={0} value={form.limite_workspaces}
                onChange={(e) => setForm((f) => ({ ...f, limite_workspaces: Number(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Limite de créditos</Label>
              <Input type="number" min={0} step="0.01" value={form.limite_creditos}
                onChange={(e) => setForm((f) => ({ ...f, limite_creditos: Number(e.target.value) }))} />
              <p className="text-xs text-muted-foreground">
                Quando o consumo atingir esse valor, a conta é suspensa automaticamente.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveQuotas}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}