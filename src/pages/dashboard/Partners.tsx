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
  Clock, CheckCircle2, AlertTriangle, Plus, Copy, Bot,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { z } from "zod";
import PartnerBotsDialog from "@/components/dashboard/partners/PartnerBotsDialog";

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

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    nome: "",
    whatsapp: "",
    status: "ativo" as "pendente" | "ativo" | "suspenso",
    limite_clientes: 50,
    limite_workspaces: 100,
    limite_creditos: 1000,
    send_invite: true,
  });
  const [createdInfo, setCreatedInfo] = useState<{
    email: string;
    temp_password: string | null;
    already_existed: boolean;
    invited: boolean;
  } | null>(null);

  const [botsFor, setBotsFor] = useState<Parceiro | null>(null);

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

  const resetCreateForm = () =>
    setCreateForm({
      email: "",
      nome: "",
      whatsapp: "",
      status: "ativo",
      limite_clientes: 50,
      limite_workspaces: 100,
      limite_creditos: 1000,
      send_invite: true,
    });

  const handleCreate = async () => {
    const schema = z.object({
      email: z.string().trim().toLowerCase().email("E-mail inválido").max(255),
      nome: z.string().trim().max(120).optional().or(z.literal("")),
      whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
      status: z.enum(["pendente", "ativo", "suspenso"]),
      limite_clientes: z.number().int().min(0).max(100000),
      limite_workspaces: z.number().int().min(0).max(100000),
      limite_creditos: z.number().min(0).max(10_000_000),
      send_invite: z.boolean(),
    });
    const parsed = schema.safeParse(createForm);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return toast.error(first?.message ?? "Dados inválidos");
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("admin-create-partner", {
      body: parsed.data,
    });
    setCreating(false);
    if (error) {
      const msg = (error as any)?.context?.error || error.message || "Falha ao criar parceiro";
      return toast.error(typeof msg === "string" ? msg : "Falha ao criar parceiro");
    }
    if ((data as any)?.error) {
      return toast.error((data as any).error);
    }
    toast.success(
      (data as any)?.already_existed
        ? "Parceiro vinculado a usuário existente"
        : "Parceiro criado com sucesso"
    );
    setCreatedInfo({
      email: (data as any).email,
      temp_password: (data as any).temp_password ?? null,
      already_existed: !!(data as any).already_existed,
      invited: !!(data as any).invited,
    });
    setCreateOpen(false);
    resetCreateForm();
    load();
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border neon-border cyber-grid p-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-primary/80">
            <Handshake className="h-3.5 w-3.5" /> Admin • Parceiros
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mt-2">
            <span className="neon-text">Parceiros</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Aprove novos parceiros, defina cotas e acompanhe o consumo de cada um.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo parceiro
          </Button>
        </div>
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
                          <Button size="icon" variant="ghost" title="Bots de farm" onClick={() => setBotsFor(p)}>
                            <Bot className="h-4 w-4" />
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

      {/* Create partner dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreateForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo parceiro</DialogTitle>
            <DialogDescription>
              Crie manualmente um parceiro. Se o e-mail já tiver conta, ele será vinculado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>E-mail *</Label>
              <Input
                type="email"
                placeholder="parceiro@exemplo.com"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={createForm.nome}
                  onChange={(e) => setCreateForm((f) => ({ ...f, nome: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input
                  placeholder="+55..."
                  value={createForm.whatsapp}
                  onChange={(e) => setCreateForm((f) => ({ ...f, whatsapp: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status inicial</Label>
              <Select
                value={createForm.status}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, status: v as any }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Clientes</Label>
                <Input type="number" min={0} value={createForm.limite_clientes}
                  onChange={(e) => setCreateForm((f) => ({ ...f, limite_clientes: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Workspaces</Label>
                <Input type="number" min={0} value={createForm.limite_workspaces}
                  onChange={(e) => setCreateForm((f) => ({ ...f, limite_workspaces: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Créditos</Label>
                <Input type="number" min={0} step="0.01" value={createForm.limite_creditos}
                  onChange={(e) => setCreateForm((f) => ({ ...f, limite_creditos: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Enviar convite por e-mail</div>
                <div className="text-xs text-muted-foreground">
                  Se desligado, geramos uma senha temporária para você compartilhar.
                </div>
              </div>
              <Switch
                checked={createForm.send_invite}
                onCheckedChange={(v) => setCreateForm((f) => ({ ...f, send_invite: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Criando..." : "Criar parceiro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Created info / temp password */}
      <Dialog open={!!createdInfo} onOpenChange={(o) => !o && setCreatedInfo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Parceiro {createdInfo?.already_existed ? "vinculado" : "criado"}</DialogTitle>
            <DialogDescription>{createdInfo?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {createdInfo?.invited && (
              <p className="text-sm text-muted-foreground">
                Convite enviado por e-mail. O parceiro precisa abrir o link para definir a senha.
              </p>
            )}
            {createdInfo?.temp_password && (
              <div className="space-y-2">
                <Label>Senha temporária</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={createdInfo.temp_password} className="font-mono" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(createdInfo.temp_password!);
                      toast.success("Senha copiada");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Compartilhe com o parceiro e oriente trocar a senha no primeiro acesso.
                </p>
              </div>
            )}
            {!createdInfo?.invited && !createdInfo?.temp_password && (
              <p className="text-sm text-muted-foreground">
                Usuário já existia no sistema — vinculado como parceiro com as configurações escolhidas.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedInfo(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {botsFor && (
        <PartnerBotsDialog
          open={!!botsFor}
          onOpenChange={(o) => !o && setBotsFor(null)}
          partnerId={botsFor.user_id}
          partnerName={botsFor.nome ?? profiles.get(botsFor.user_id)}
        />
      )}
    </div>
  );
}