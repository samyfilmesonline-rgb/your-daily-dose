import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Bot as BotIcon, Activity, Coins, Plus, Copy, ExternalLink, Trash2, Pencil,
} from "lucide-react";
import GlitchText from "@/components/landing/GlitchText";

type BotRow = {
  id: string;
  partner_id: string;
  email_lovable: string;
  nickname: string | null;
  status: "idle" | "busy" | "offline" | "disabled";
  current_order_id: string | null;
  last_heartbeat_at: string | null;
};

type Order = {
  id: string;
  customer_name: string;
  customer_email: string;
  credits: number;
  amount_cents: number;
  status: string;
  assigned_bot_id: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  created_at: string;
};

type Pack = {
  id: string;
  partner_id: string;
  name: string;
  credits: number;
  price_cents: number;
  original_price_cents: number | null;
  badge_label: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
};

const statusColor: Record<BotRow["status"], string> = {
  idle: "bg-primary/10 text-primary border-primary/40",
  busy: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  offline: "bg-muted text-muted-foreground border-muted-foreground/30",
  disabled: "bg-destructive/10 text-destructive border-destructive/40",
};

function brl(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BotRow[];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_credit_orders")
        .select("id, customer_name, customer_email, credits, amount_cents, status, assigned_bot_id, paid_at, delivered_at, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  const { data: packs = [], refetch: refetchPacks } = useQuery({
    queryKey: ["my-packs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_credit_packs")
        .select("*")
        .eq("partner_id", user!.id)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Pack[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`bots-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "farm_bots", filter: `partner_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-bots", user.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_credit_orders", filter: `partner_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-orders", user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  const stats = useMemo(() => ({
    total: bots.length,
    idle: bots.filter((b) => b.status === "idle").length,
    busy: bots.filter((b) => b.status === "busy").length,
    offline: bots.filter((b) => b.status === "offline" || b.status === "disabled").length,
  }), [bots]);

  const checkoutUrl = `${window.location.origin}/comprar/${user?.id ?? ""}`;

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
          Cada bot é uma conta Lovable que entrega créditos para um cliente. Quando um pedido é pago,
          um bot ocioso é selecionado automaticamente. Se nenhum estiver livre, o pedido fica na fila.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: "Total", v: stats.total, c: "text-foreground" },
          { l: "Ociosos", v: stats.idle, c: "text-primary" },
          { l: "Em uso", v: stats.busy, c: "text-amber-400" },
          { l: "Offline", v: stats.offline, c: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.l}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{s.l}</CardTitle>
            </CardHeader>
            <CardContent><div className={`text-3xl font-black font-mono ${s.c}`}>{s.v}</div></CardContent>
          </Card>
        ))}
      </div>

      {/* Link público */}
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

      <Tabs defaultValue="bots">
        <TabsList>
          <TabsTrigger value="bots"><BotIcon className="w-3.5 h-3.5 mr-1.5" /> Bots</TabsTrigger>
          <TabsTrigger value="orders"><Activity className="w-3.5 h-3.5 mr-1.5" /> Pedidos</TabsTrigger>
          <TabsTrigger value="packs"><Coins className="w-3.5 h-3.5 mr-1.5" /> Meus pacotes</TabsTrigger>
        </TabsList>

        <TabsContent value="bots" className="mt-4">
          {bots.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">
              Você ainda não tem bots cadastrados. Solicite ao administrador a liberação dos seus bots.
            </CardContent></Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {bots.map((b) => (
                <Card key={b.id} className="border-primary/20">
                  <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-mono">
                      {b.nickname ?? `Bot ${b.id.slice(0, 6)}`}
                    </CardTitle>
                    <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${statusColor[b.status]}`}>
                      {b.status}
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="text-xs text-muted-foreground font-mono break-all">{b.email_lovable}</div>
                    {b.current_order_id && (
                      <div className="text-[11px] text-amber-400">Processando pedido {b.current_order_id.slice(0, 8)}…</div>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      Último sinal: {b.last_heartbeat_at ? new Date(b.last_heartbeat_at).toLocaleString("pt-BR") : "—"}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Pacote</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Bot</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum pedido ainda.</TableCell></TableRow>
                  )}
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <div className="font-medium">{o.customer_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{o.customer_email}</div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{o.credits} cr · {brl(o.amount_cents)}</TableCell>
                      <TableCell>
                        <span className="text-[10px] font-mono uppercase tracking-wider border border-primary/30 bg-primary/5 px-2 py-0.5 rounded">
                          {o.status}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {o.assigned_bot_id ? (bots.find((b) => b.id === o.assigned_bot_id)?.nickname ?? o.assigned_bot_id.slice(0, 8)) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packs" className="mt-4">
          <PacksManager packs={packs} partnerId={user?.id ?? ""} onChange={refetchPacks} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PacksManager({ packs, partnerId, onChange }: { packs: Pack[]; partnerId: string; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Pack | null>(null);
  const [form, setForm] = useState({
    name: "",
    credits: 200,
    price_cents: 2700,
    original_price_cents: 5700,
    badge_label: "OFERTA DE LANÇAMENTO",
    description: "",
    is_active: true,
    display_order: 0,
  });

  const openNew = () => {
    setEditing(null);
    setForm({
      name: "Pacote 200 créditos",
      credits: 200,
      price_cents: 2700,
      original_price_cents: 5700,
      badge_label: "OFERTA DE LANÇAMENTO",
      description: "",
      is_active: true,
      display_order: 0,
    });
    setOpen(true);
  };
  const openEdit = (p: Pack) => {
    setEditing(p);
    setForm({
      name: p.name,
      credits: p.credits,
      price_cents: p.price_cents,
      original_price_cents: p.original_price_cents ?? 0,
      badge_label: p.badge_label ?? "",
      description: p.description ?? "",
      is_active: p.is_active,
      display_order: p.display_order,
    });
    setOpen(true);
  };

  const save = async () => {
    const payload = {
      partner_id: partnerId,
      name: form.name.trim(),
      credits: Math.max(1, Math.floor(form.credits)),
      price_cents: Math.max(1, Math.floor(form.price_cents)),
      original_price_cents: form.original_price_cents > 0 ? Math.floor(form.original_price_cents) : null,
      badge_label: form.badge_label.trim() || null,
      description: form.description.trim() || null,
      is_active: form.is_active,
      display_order: form.display_order,
    };
    const res = editing
      ? await supabase.from("partner_credit_packs").update(payload).eq("id", editing.id)
      : await supabase.from("partner_credit_packs").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Pacote salvo");
    setOpen(false);
    onChange();
  };

  const del = async (id: string) => {
    if (!confirm("Excluir pacote?")) return;
    const { error } = await supabase.from("partner_credit_packs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removido");
    onChange();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1.5" /> Novo pacote</Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Créditos</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packs.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum pacote ainda.</TableCell></TableRow>
              )}
              {packs.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono">{p.credits}</TableCell>
                  <TableCell className="font-mono">
                    {brl(p.price_cents)}
                    {p.original_price_cents && (
                      <span className="text-xs text-muted-foreground line-through ml-2">{brl(p.original_price_cents)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={p.is_active} onCheckedChange={async (v) => {
                      await supabase.from("partner_credit_packs").update({ is_active: v }).eq("id", p.id);
                      onChange();
                    }} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(p.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar pacote" : "Novo pacote"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Créditos</Label><Input type="number" value={form.credits} onChange={(e) => setForm((f) => ({ ...f, credits: Number(e.target.value) }))} /></div>
              <div><Label>Ordem</Label><Input type="number" value={form.display_order} onChange={(e) => setForm((f) => ({ ...f, display_order: Number(e.target.value) }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Preço (centavos)</Label><Input type="number" value={form.price_cents} onChange={(e) => setForm((f) => ({ ...f, price_cents: Number(e.target.value) }))} /></div>
              <div><Label>Preço original (centavos)</Label><Input type="number" value={form.original_price_cents} onChange={(e) => setForm((f) => ({ ...f, original_price_cents: Number(e.target.value) }))} /></div>
            </div>
            <div><Label>Etiqueta de oferta</Label><Input value={form.badge_label} onChange={(e) => setForm((f) => ({ ...f, badge_label: e.target.value }))} /></div>
            <div><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              <Label>Ativo (visível para clientes)</Label>
            </div>
            <Button onClick={save} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}