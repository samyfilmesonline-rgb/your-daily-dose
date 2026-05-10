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
import { Loader2, Zap, Clock, Layers, CalendarClock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { z } from "zod";

type Bot = {
  id: string;
  nickname: string | null;
  email_lovable: string;
  status: string;
  partner_id: string;
};

type Partner = { user_id: string; nome: string | null; email: string | null };

const baseSchema = {
  customerName: z.string().trim().min(1, "Obrigatório").max(200),
  customerEmail: z.string().trim().email("E-mail inválido").max(255),
  customerWhatsapp: z.string().trim().max(40).optional(),
  notes: z.string().trim().min(3, "Mínimo 3 caracteres").max(500),
};
const schemaSingle = z.object({
  ...baseSchema,
  targetWorkspace: z.string().trim().min(1, "Obrigatório").max(200),
  credits: z.coerce.number().int().min(1, "Mínimo 1").max(100000),
  amountReais: z.coerce.number().min(0).max(100000),
});
const schemaMulti = z.object({
  ...baseSchema,
  pricePerWorkspaceReais: z.coerce.number().min(0.01, "Mínimo R$ 0,01").max(100000),
});
const schemaSchedule = z.object({
  ...baseSchema,
  pricePerWorkspaceReais: z.coerce.number().min(0.01, "Mínimo R$ 0,01").max(100000),
  totalDays: z.coerce.number().int().min(1).max(365).optional(),
  endAt: z.string().optional(),
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
  const [multiWs, setMultiWs] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [endMode, setEndMode] = useState<"days" | "until_date">("days");
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerWhatsapp: "",
    targetWorkspace: "",
    credits: "",
    amountReais: "",
    pricePerWorkspaceReais: "",
    totalDays: "7",
    endAt: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setPartnerId(user?.id ?? "");
      setBotId("auto");
      setErrors({});
      setMultiWs(false);
      setRecurring(false);
      setEndMode("days");
    }
  }, [open, user?.id]);

  // Multi-ws só faz sentido com bot específico
  useEffect(() => {
    if (botId === "auto" && multiWs) setMultiWs(false);
  }, [botId, multiWs]);

  // Recorrência só com multi-ws
  useEffect(() => {
    if (!multiWs && recurring) setRecurring(false);
  }, [multiWs, recurring]);

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
    const parsed = recurring
      ? schemaSchedule.safeParse(form)
      : multiWs
        ? schemaMulti.safeParse(form)
        : schemaSingle.safeParse(form);
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
    if (multiWs && botId === "auto") {
      toast({ title: "Escolha um bot específico", description: "O modo 'todos os workspaces' precisa de um bot específico.", variant: "destructive" });
      return;
    }
    if (botId !== "auto" && selectedBot?.status === "disabled") {
      toast({ title: "Bot desabilitado", description: "Escolha outro bot ou use atribuição automática.", variant: "destructive" });
      return;
    }
    if (recurring && endMode === "until_date" && !form.endAt) {
      setErrors((e) => ({ ...e, endAt: "Selecione a data final" }));
      return;
    }
    setSubmitting(true);
    try {
      const v = parsed.data as typeof form & { credits?: number; amountReais?: number; targetWorkspace?: string; pricePerWorkspaceReais?: number; totalDays?: number; endAt?: string };
      const fnName = recurring
        ? "partner-shop-create-order-schedule"
        : "partner-shop-create-manual-order";
      const { data, error } = await supabase.functions.invoke(
        fnName,
        {
          body: recurring
            ? {
                partnerId: isAdmin ? effectivePartnerId : undefined,
                botId,
                customerName: v.customerName,
                customerEmail: v.customerEmail,
                customerWhatsapp: v.customerWhatsapp || null,
                notes: v.notes,
                pricePerWorkspaceCents: Math.round(Number(v.pricePerWorkspaceReais) * 100),
                endMode,
                totalDays: endMode === "days" ? Number(v.totalDays ?? form.totalDays) : undefined,
                endAt: endMode === "until_date" ? new Date(form.endAt).toISOString() : undefined,
              }
            : multiWs
            ? {
                partnerId: isAdmin ? effectivePartnerId : undefined,
                customerName: v.customerName,
                customerEmail: v.customerEmail,
                customerWhatsapp: v.customerWhatsapp || null,
                notes: v.notes,
                botId,
                multiWorkspaceMode: true,
                pricePerWorkspaceCents: Math.round(Number(v.pricePerWorkspaceReais) * 100),
              }
            : {
                partnerId: isAdmin ? effectivePartnerId : undefined,
                customerName: v.customerName,
                customerEmail: v.customerEmail,
                customerWhatsapp: v.customerWhatsapp || null,
                targetWorkspace: v.targetWorkspace,
                credits: v.credits,
                amountCents: Math.round(Number(v.amountReais) * 100),
                notes: v.notes,
                botId: botId === "auto" ? null : botId,
              },
        },
      );
      if (error) throw error;
      if (recurring) {
        toast({
          title: "Programação criada",
          description: "O farm vai rodar todo dia no mesmo horário até o fim do prazo.",
        });
        qc.invalidateQueries({ queryKey: ["my-schedules", user?.id] });
      } else {
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
      }
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
        pricePerWorkspaceReais: "",
        totalDays: "7",
        endAt: "",
        notes: "",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast({ title: "Falha ao criar", description: msg, variant: "destructive" });
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
            {!multiWs && (
              <>
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
              </>
            )}
            {multiWs && (
              <div className="col-span-2">
                <Label className="text-xs">Valor por workspace (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.pricePerWorkspaceReais}
                  onChange={(e) => field("pricePerWorkspaceReais", e.target.value)}
                />
                {errors.pricePerWorkspaceReais && (
                  <p className="text-[10px] text-destructive mt-0.5">{errors.pricePerWorkspaceReais}</p>
                )}
              </div>
            )}
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

          <div className={`flex items-start gap-3 rounded-md border p-3 ${botId === "auto" ? "opacity-50" : ""}`}>
            <Switch
              checked={multiWs}
              onCheckedChange={setMultiWs}
              disabled={botId === "auto"}
              id="multi-ws"
            />
            <div className="flex-1">
              <label htmlFor="multi-ws" className="text-xs font-medium flex items-center gap-1 cursor-pointer">
                <Layers className="w-3 h-3" /> Farmar todos os workspaces do bot (200 cada)
              </label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {botId === "auto"
                  ? "Disponível apenas com um bot específico selecionado."
                  : "O bot lista os workspaces dessa conta no Lovable e farma 200 créditos em cada um, em ordem. Total de créditos e valor são calculados após o início."}
              </p>
            </div>
          </div>

          {multiWs && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] text-amber-200">
              ⚠️ Requer worker desktop atualizado (com suporte a multi-workspace).
              O pedido fica em "Aguardando worker iniciar" até o desktop enviar a lista
              de workspaces. Sem essa atualização, o farm não inicia.
            </div>
          )}

          {multiWs && (
            <div className={`flex items-start gap-3 rounded-md border p-3 ${!multiWs ? "opacity-50" : ""}`}>
              <Switch
                checked={recurring}
                onCheckedChange={setRecurring}
                disabled={!multiWs}
                id="recurring"
              />
              <div className="flex-1">
                <label htmlFor="recurring" className="text-xs font-medium flex items-center gap-1 cursor-pointer">
                  <CalendarClock className="w-3 h-3" /> Repetir diariamente (programação)
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Cria um pedido novo todo dia no mesmo horário desta criação,
                  durante o período definido. A cada execução debita 200 × workspaces.
                </p>
              </div>
            </div>
          )}

          {recurring && (
            <div className="rounded-md border p-3 space-y-3">
              <RadioGroup value={endMode} onValueChange={(v) => setEndMode(v as "days" | "until_date")} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="days" id="m-days" />
                  <label htmlFor="m-days" className="text-xs cursor-pointer">Por X dias</label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="until_date" id="m-until" />
                  <label htmlFor="m-until" className="text-xs cursor-pointer">Até data</label>
                </div>
              </RadioGroup>

              {endMode === "days" ? (
                <div>
                  <Label className="text-xs">Quantidade de dias (1–365)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={form.totalDays}
                    onChange={(e) => field("totalDays", e.target.value)}
                  />
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Data final</Label>
                  <Input
                    type="datetime-local"
                    value={form.endAt}
                    onChange={(e) => field("endAt", e.target.value)}
                  />
                  {errors.endAt && <p className="text-[10px] text-destructive mt-0.5">{errors.endAt}</p>}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground">
                Disparo diário no mesmo horário da criação. Se o bot estiver ocupado,
                o pedido daquele dia entra na fila e roda assim que o bot liberar.
              </p>
            </div>
          )}

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
            {submitting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Criando...</> : recurring ? "Criar programação" : "Criar recarga"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}