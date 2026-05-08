import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Zap, Clock } from "lucide-react";
import { z } from "zod";

type Bot = {
  id: string;
  nickname: string | null;
  email_lovable: string;
  status: string;
  partner_id: string;
};

type Partner = { user_id: string; nome: string | null; email: string | null };

const schema = z.object({
  customerName: z.string().trim().min(1, "Obrigatório").max(200),
  customerEmail: z.string().trim().email("E-mail inválido").max(255),
  customerWhatsapp: z.string().trim().max(40).optional(),
  targetWorkspace: z.string().trim().min(1, "Obrigatório").max(200),
  credits: z.coerce.number().int().min(1, "Mínimo 1").max(100000),
  amountReais: z.coerce.number().min(0).max(100000),
  notes: z.string().trim().min(3, "Mínimo 3 caracteres").max(500),
});

export default function ManualOrderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [partnerId, setPartnerId] = useState<string>("");
  const [botId, setBotId] = useState<string>("auto");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerWhatsapp: "",
    targetWorkspace: "",
    credits: "",
    amountReais: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setPartnerId(user?.id ?? "");
      setBotId("auto");
      setErrors({});
    }
  }, [open, user?.id]);

  // Admin: load partner list
  const { data: partners = [] } = useQuery({
    queryKey: ["manual-order-partners"],
    enabled: open && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parceiros")
        .select("user_id, nome, status")
        .eq("status", "ativo");
      if (error) throw error;
      const ids = (data ?? []).map((p) => p.user_id);
      if (ids.length === 0) return [] as Partner[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", ids);
      const emailById = new Map((profs ?? []).map((p) => [p.id, p.email]));
      return (data ?? []).map((p) => ({
        user_id: p.user_id,
        nome: p.nome,
        email: emailById.get(p.user_id) ?? null,
      })) as Partner[];
    },
  });

  const effectivePartnerId = isAdmin ? partnerId : user?.id ?? "";

  const { data: bots = [] } = useQuery({
    queryKey: ["manual-order-bots", effectivePartnerId],
    enabled: open && !!effectivePartnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("farm_bots")
        .select("id, nickname, email_lovable, status, partner_id")
        .eq("partner_id", effectivePartnerId)
        .order("status", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Bot[];
    },
  });

  const selectedBot = useMemo(
    () => bots.find((b) => b.id === botId) ?? null,
    [bots, botId],
  );

  const willQueue = !!selectedBot && selectedBot.status !== "idle";

  async function handleSubmit() {
    setErrors({});
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const e: Record<string, string> = {};
      Object.entries(flat).forEach(([k, v]) => { if (v?.[0]) e[k] = v[0]; });
      setErrors(e);
      return;
    }
    if (isAdmin && !effectivePartnerId) {
      toast({ title: "Selecione o parceiro", variant: "destructive" });
      return;
    }
    if (botId !== "auto" && selectedBot?.status === "disabled") {
      toast({ title: "Bot desabilitado", description: "Escolha outro bot ou use atribuição automática.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const v = parsed.data;
      const { data, error } = await supabase.functions.invoke(
        "partner-shop-create-manual-order",
        {
          body: {
            partnerId: isAdmin ? effectivePartnerId : undefined,
            customerName: v.customerName,
            customerEmail: v.customerEmail,
            customerWhatsapp: v.customerWhatsapp || null,
            targetWorkspace: v.targetWorkspace,
            credits: v.credits,
            amountCents: Math.round(v.amountReais * 100),
            notes: v.notes,
            botId: botId === "auto" ? null : botId,
          },
        },
      );
      if (error) throw error;
      const status = (data as { status?: string } | null)?.status ?? "paid";
      toast({
        title: "Recarga criada",
        description:
          status === "processing"
            ? "Bot iniciou o farm agora."
            : status === "queued"
              ? "Sem bot livre — entrou na fila."
              : `Status: ${status}`,
      });
      qc.invalidateQueries({ queryKey: ["my-orders", user?.id] });
      qc.invalidateQueries({ queryKey: ["my-bots-mini", user?.id] });
      onOpenChange(false);
      setForm({
        customerName: "",
        customerEmail: "",
        customerWhatsapp: "",
        targetWorkspace: "",
        credits: "",
        amountReais: "",
        notes: "",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast({ title: "Falha ao criar recarga", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function field<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova recarga manual</DialogTitle>
          <DialogDescription>
            Cria um pedido pago manualmente e atribui um bot. Se o bot estiver ocupado, entra na fila.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isAdmin && (
            <div>
              <Label className="text-xs">Parceiro</Label>
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger><SelectValue placeholder="Selecione o parceiro" /></SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.nome ?? p.email ?? p.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nome do cliente</Label>
              <Input value={form.customerName} onChange={(e) => field("customerName", e.target.value)} />
              {errors.customerName && <p className="text-[10px] text-destructive mt-0.5">{errors.customerName}</p>}
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input type="email" value={form.customerEmail} onChange={(e) => field("customerEmail", e.target.value)} />
              {errors.customerEmail && <p className="text-[10px] text-destructive mt-0.5">{errors.customerEmail}</p>}
            </div>
            <div>
              <Label className="text-xs">WhatsApp (opcional)</Label>
              <Input value={form.customerWhatsapp} onChange={(e) => field("customerWhatsapp", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Workspace alvo</Label>
              <Input value={form.targetWorkspace} onChange={(e) => field("targetWorkspace", e.target.value)} />
              {errors.targetWorkspace && <p className="text-[10px] text-destructive mt-0.5">{errors.targetWorkspace}</p>}
            </div>
            <div>
              <Label className="text-xs">Créditos</Label>
              <Input type="number" min={1} value={form.credits} onChange={(e) => field("credits", e.target.value)} />
              {errors.credits && <p className="text-[10px] text-destructive mt-0.5">{errors.credits}</p>}
            </div>
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" min={0} step="0.01" value={form.amountReais} onChange={(e) => field("amountReais", e.target.value)} />
              {errors.amountReais && <p className="text-[10px] text-destructive mt-0.5">{errors.amountReais}</p>}
            </div>
          </div>

          <div>
            <Label className="text-xs">Bot</Label>
            <Select value={botId} onValueChange={setBotId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático (qualquer bot livre)</SelectItem>
                {bots.map((b) => (
                  <SelectItem key={b.id} value={b.id} disabled={b.status === "disabled"}>
                    {(b.nickname ?? b.email_lovable)} · {b.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBot && (
              <p className="text-[10px] mt-1 flex items-center gap-1 text-muted-foreground">
                {willQueue ? (
                  <><Clock className="w-3 h-3 text-amber-400" /> Bot ocupado — pedido entrará na fila.</>
                ) : (
                  <><Zap className="w-3 h-3 text-primary" /> Bot ocioso — farm inicia imediatamente.</>
                )}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Observações (motivo / referência)</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => field("notes", e.target.value)}
              placeholder="Ex.: Reposição cortesia — ticket #123"
              className="min-h-[60px] text-xs"
            />
            {errors.notes && <p className="text-[10px] text-destructive mt-0.5">{errors.notes}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Criando...</> : "Criar recarga"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}