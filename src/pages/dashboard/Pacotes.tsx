import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Coins } from "lucide-react";
import GlitchText from "@/components/landing/GlitchText";

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

function brl(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Pacotes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => { document.title = "Pacotes de Créditos · Matrix"; }, []);

  const { data: packs = [] } = useQuery({
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

  const refetch = () => qc.invalidateQueries({ queryKey: ["my-packs", user!.id] });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Pack | null>(null);
  const [form, setForm] = useState({
    name: "Pacote 200 créditos",
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
      credits: 200, price_cents: 2700, original_price_cents: 5700,
      badge_label: "OFERTA DE LANÇAMENTO", description: "",
      is_active: true, display_order: 0,
    });
    setOpen(true);
  };
  const openEdit = (p: Pack) => {
    setEditing(p);
    setForm({
      name: p.name, credits: p.credits, price_cents: p.price_cents,
      original_price_cents: p.original_price_cents ?? 0,
      badge_label: p.badge_label ?? "", description: p.description ?? "",
      is_active: p.is_active, display_order: p.display_order,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user?.id) return;
    if (form.credits <= 0) return toast.error("Créditos deve ser > 0");
    if (form.price_cents <= 0) return toast.error("Preço deve ser > 0");
    const payload = {
      partner_id: user.id,
      name: form.name.trim(),
      credits: Math.floor(form.credits),
      price_cents: Math.floor(form.price_cents),
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
    refetch();
  };

  const del = async (id: string) => {
    if (!confirm("Excluir pacote?")) return;
    const { error } = await supabase.from("partner_credit_packs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removido");
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-primary/70">
          <Coins className="w-3.5 h-3.5" /> Console / Pacotes
        </div>
        <h1 className="text-3xl sm:text-4xl font-black font-mono">
          <GlitchText>PACOTES DE CRÉDITOS</GlitchText>
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Configure os pacotes que aparecem no seu link público de venda.
        </p>
      </div>

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
                <TableHead>Ordem</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packs.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum pacote ainda.</TableCell></TableRow>
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
                  <TableCell className="font-mono">{p.display_order}</TableCell>
                  <TableCell>
                    <Switch checked={p.is_active} onCheckedChange={async (v) => {
                      await supabase.from("partner_credit_packs").update({ is_active: v }).eq("id", p.id);
                      refetch();
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
          <DialogHeader><DialogTitle>{editing ? "Editar pacote" : "Novo pacote"}</DialogTitle></DialogHeader>
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
