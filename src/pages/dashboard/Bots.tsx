import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bot as BotIcon, Plus, Copy, ExternalLink, Trash2, Pencil, AlertTriangle } from "lucide-react";
import GlitchText from "@/components/landing/GlitchText";

type BotRow = {
  id: string;
  partner_id: string;
  email_lovable: string;
  nickname: string | null;
  status: "idle" | "busy" | "offline" | "disabled";
  current_order_id: string | null;
  last_heartbeat_at: string | null;
  notes: string | null;
};

const statusMeta: Record<BotRow["status"], { label: string; cls: string }> = {
  idle:     { label: "Disponível",  cls: "bg-primary/10 text-primary border-primary/40" },
  busy:     { label: "Processando", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  offline:  { label: "Offline",     cls: "bg-muted text-muted-foreground border-muted-foreground/30" },
  disabled: { label: "Desativado",  cls: "bg-destructive/10 text-destructive border-destructive/40" },
};

function heartbeatLabel(ts: string | null): { label: string; cls: string } {
  if (!ts) return { label: "sem heartbeat", cls: "text-muted-foreground" };
  const ageSec = (Date.now() - new Date(ts).getTime()) / 1000;
  if (ageSec < 60) return { label: `online (há ${Math.floor(ageSec)}s)`, cls: "text-primary" };
  if (ageSec < 300) return { label: `há ${Math.floor(ageSec / 60)} min`, cls: "text-amber-400" };
  return { label: "sem sinal recente", cls: "text-destructive" };
}

export default function Bots() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => { document.title = "Bots de Farm · Matrix"; }, []);

  const { data: bots = [] } = useQuery({
    queryKey: ["my-bots", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("farm_bots_partner_view")
        .select("*")
        .eq("partner_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BotRow[];
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`bots-rt-${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "farm_bots", filter: `partner_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-bots", user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  // tick para atualizar labels de heartbeat a cada 15s
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(i);
  }, []);

  const stats = useMemo(() => ({
    total: bots.length,
    idle: bots.filter((b) => b.status === "idle").length,
    busy: bots.filter((b) => b.status === "busy").length,
    offline: bots.filter((b) => b.status === "offline" || b.status === "disabled").length,
  }), [bots]);

  const heartbeatStale = bots.length > 0 && bots.every((b) => {
    if (!b.last_heartbeat_at) return true;
    return (Date.now() - new Date(b.last_heartbeat_at).getTime()) / 1000 > 300;
  });

  const checkoutUrl = `${window.location.origin}/comprar/${user?.id ?? ""}`;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BotRow | null>(null);
  const [form, setForm] = useState({
    email_lovable: "",
    senha_lovable: "",
    nickname: "",
    notes: "",
  });

  const openNew = () => {
    setEditing(null);
    setForm({ email_lovable: "", senha_lovable: "", nickname: "", notes: "" });
    setOpen(true);
  };
  const openEdit = (b: BotRow) => {
    setEditing(b);
    setForm({
      email_lovable: b.email_lovable,
      senha_lovable: "",
      nickname: b.nickname ?? "",
      notes: b.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user?.id) return;
    const email = form.email_lovable.trim().toLowerCase();
    if (!email) return toast.error("Informe o e-mail");
    if (!editing && !form.senha_lovable) return toast.error("Informe a senha");

    if (editing) {
      const patch: Record<string, unknown> = {
        email_lovable: email,
        nickname: form.nickname.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (form.senha_lovable) patch.senha_lovable = form.senha_lovable;
      const { error } = await supabase.from("farm_bots").update(patch).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("farm_bots").insert({
        partner_id: user.id,
        email_lovable: email,
        senha_lovable: form.senha_lovable,
        nickname: form.nickname.trim() || null,
        notes: form.notes.trim() || null,
        status: "idle",
      });
      if (error) return toast.error(error.message);
    }
    toast.success("Bot salvo");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["my-bots", user.id] });
  };

  const toggleActive = async (b: BotRow, active: boolean) => {
    if (b.status !== "idle" && b.status !== "disabled") {
      return toast.error("Bot ocupado/offline. Aguarde o worker liberar.");
    }
    const { error } = await supabase
      .from("farm_bots")
      .update({ status: active ? "idle" : "disabled" })
      .eq("id", b.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["my-bots", user!.id] });
  };

  const remove = async (b: BotRow) => {
    if (b.status === "busy") return toast.error("Bot está processando, não pode ser removido.");
    if (!confirm(`Remover bot ${b.nickname ?? b.email_lovable}?`)) return;
    const { error } = await supabase.from("farm_bots").delete().eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success("Removido");
    qc.invalidateQueries({ queryKey: ["my-bots", user!.id] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-primary/70">
          <BotIcon className="w-3.5 h-3.5" /> Console / Bots
        </div>
        <h1 className="text-3xl sm:text-4xl font-black font-mono">
          <GlitchText>BOTS DE FARM</GlitchText>
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Cada bot é uma conta Lovable. Quando um pedido é pago, o sistema escolhe automaticamente um bot
          disponível. Você não precisa atribuir manualmente.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: "Total", v: stats.total, c: "text-foreground" },
          { l: "Disponíveis", v: stats.idle, c: "text-primary" },
          { l: "Processando", v: stats.busy, c: "text-amber-400" },
          { l: "Offline / Desativados", v: stats.offline, c: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.l}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{s.l}</CardTitle>
            </CardHeader>
            <CardContent><div className={`text-3xl font-black font-mono ${s.c}`}>{s.v}</div></CardContent>
          </Card>
        ))}
      </div>

      {bots.length === 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Nenhum bot cadastrado. Adicione ao menos um bot para receber pedidos.
        </div>
      )}
      {bots.length > 0 && stats.idle === 0 && stats.busy === 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          Nenhum bot disponível no momento. Pedidos novos vão para a fila até um bot ficar livre.
        </div>
      )}
      {heartbeatStale && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Worker offline: nenhum bot enviou heartbeat nos últimos 5 min.
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-primary" /> Seu link público de venda
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2 items-center">
          <Input readOnly value={checkoutUrl} className="font-mono text-xs" />
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(checkoutUrl); toast.success("Copiado"); }}>
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar
          </Button>
          <Button size="sm" asChild>
            <a href={checkoutUrl} target="_blank" rel="noreferrer">Abrir</a>
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1.5" /> Novo bot</Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bot</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Heartbeat</TableHead>
                <TableHead>Pedido em curso</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bots.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum bot ainda.</TableCell></TableRow>
              )}
              {bots.map((b) => {
                const meta = statusMeta[b.status];
                const hb = heartbeatLabel(b.last_heartbeat_at);
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="font-medium">{b.nickname ?? `Bot ${b.id.slice(0, 6)}`}</div>
                      <div className="text-xs text-muted-foreground font-mono break-all">{b.email_lovable}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className={`text-xs font-mono ${hb.cls}`}>{hb.label}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {b.current_order_id ? b.current_order_id.slice(0, 8) + "…" : "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={b.status !== "disabled"}
                        disabled={b.status === "busy" || b.status === "offline"}
                        onCheckedChange={(v) => toggleActive(b, v)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(b)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(b)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar bot" : "Novo bot"}</DialogTitle>
            <DialogDescription>
              {editing ? "A senha não é exibida. Preencha apenas se quiser alterá-la." : "Conta Lovable que será usada para entregar créditos."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>E-mail Lovable</Label>
              <Input type="email" value={form.email_lovable}
                onChange={(e) => setForm((f) => ({ ...f, email_lovable: e.target.value }))} />
            </div>
            <div>
              <Label>{editing ? "Nova senha (opcional)" : "Senha"}</Label>
              <Input type="password" value={form.senha_lovable} autoComplete="new-password"
                onChange={(e) => setForm((f) => ({ ...f, senha_lovable: e.target.value }))} />
            </div>
            <div>
              <Label>Apelido</Label>
              <Input value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button onClick={save} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
