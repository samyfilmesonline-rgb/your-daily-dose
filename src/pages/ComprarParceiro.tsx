import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import GlitchText from "@/components/landing/GlitchText";
import MatrixRain from "@/components/landing/MatrixRain";
import { matrixThemeStyle } from "@/lib/matrix-theme";
import {
  Sparkles, ShieldCheck, AlertTriangle, Ban, Clock, Coins,
  CheckCircle2, Copy, Loader2, QrCode, Mail, ExternalLink, XCircle, Hourglass, Bot,
  History, ShoppingCart, RefreshCw, Trash2, Eye, Wallet, StopCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
};

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Step = "browse" | "form" | "pix" | "paid";
type PixData = {
  orderId: string;
  txId?: string;
  qrCodeImage?: string;
  copiaECola?: string;
  paidWithBalance?: boolean;
  balanceAppliedCredits?: number;
  amountCents?: number;
};
type OrderStatus =
  | "pending" | "paid" | "queued" | "processing"
  | "delivered" | "failed" | "expired" | "refunded";
type OrderState = {
  status: OrderStatus;
  botEmail: string | null;
  assignedBotId: string | null;
  targetWorkspace: string | null;
  credits: number;
  amountCents: number;
  deliveredAt: string | null;
  failedReason: string | null;
  paidAt: string | null;
  botInviteConfirmedAt?: string | null;
  botStatus?: string | null;
  botHeartbeatAt?: string | null;
  stopRequestedAt?: string | null;
  balanceAppliedCredits?: number;
  refundedCredits?: number;
  progress?: {
    farmed: number;
    target: number;
    percent: number;
    attempts: number;
    lastEventAt: string | null;
    currentExecution: {
      id: string;
      status: string;
      creditosIniciais: number | null;
      creditosFinais: number | null;
      creditosAdicionados: number | null;
      atualizadoEm: string | null;
      iniciadoEm: string | null;
      erro: string | null;
    } | null;
    recent: Array<{
      id: string;
      status: string;
      creditosAdicionados: number | null;
      atualizadoEm: string | null;
      erro: string | null;
    }>;
  };
};

type OrderHistoryItem = {
  id: string;
  status: OrderStatus;
  credits: number;
  amountCents: number;
  targetWorkspace: string | null;
  createdAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
  failedReason: string | null;
  assignedBotId: string | null;
  botEmail: string | null;
  pixQrcode: string | null;
  pixCopyPaste: string | null;
  pixExpiresAt: string | null;
  txId: string | null;
  customerEmail: string;
  ownDevice: boolean;
  botInviteConfirmedAt?: string | null;
  stopRequestedAt?: string | null;
  balanceAppliedCredits?: number;
  balanceAppliedCents?: number;
  refundedCredits?: number;
  progress?: {
    farmed: number;
    percent: number;
    attempts?: number;
    lastStatus?: string | null;
    lastMessage?: string | null;
    lastEventAt?: string | null;
  };
};

type CustomerBalance = { credits: number; email: string | null };

const FP_KEY = "mf_client_fp";
const LAST_EMAIL_KEY = "mf_last_email";
const ACTIVE_ORDER_KEY = "mf_active_order_id";

function getOrCreateFingerprint(): string {
  try {
    let fp = localStorage.getItem(FP_KEY);
    if (!fp) {
      fp =
        typeof crypto?.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(FP_KEY, fp);
    }
    return fp;
  } catch {
    return `nofp-${Date.now()}`;
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

const STATUS_BADGE: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: "Aguardando Pix", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  paid: { label: "Pago", cls: "bg-primary/15 text-primary border-primary/40" },
  queued: { label: "Na fila", cls: "bg-primary/15 text-primary border-primary/40" },
  processing: { label: "Processando", cls: "bg-primary/15 text-primary border-primary/40" },
  delivered: { label: "Entregue", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
  failed: { label: "Falhou", cls: "bg-destructive/15 text-destructive border-destructive/40" },
  expired: { label: "Expirado", cls: "bg-muted text-muted-foreground border-border" },
  refunded: { label: "Reembolsado", cls: "bg-muted text-muted-foreground border-border" },
};

export default function ComprarParceiro() {
  const { partnerId = "" } = useParams();
  const { toast } = useToast();
  const isValidPartnerId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partnerId);

  const [selected, setSelected] = useState<Pack | null>(null);
  const [step, setStep] = useState<Step>("browse");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [taxId, setTaxId] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pix, setPix] = useState<PixData | null>(null);
  const [orderState, setOrderState] = useState<OrderState | null>(null);
  const pollRef = useRef<number | null>(null);

  // Histórico / fingerprint
  const fingerprint = useMemo(() => getOrCreateFingerprint(), []);
  const [tab, setTab] = useState<"comprar" | "pedidos">("comprar");
  const [history, setHistory] = useState<OrderHistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEmail, setHistoryEmail] = useState<string>(() => {
    try { return localStorage.getItem(LAST_EMAIL_KEY) ?? ""; } catch { return ""; }
  });
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [trackingItem, setTrackingItem] = useState<OrderHistoryItem | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [customerBalance, setCustomerBalance] = useState<CustomerBalance>({ credits: 0, email: null });
  const [useBalance, setUseBalance] = useState<boolean>(true);
  const [confirmStopId, setConfirmStopId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Comprar créditos · Matrix";
  }, []);

  // Pré-preenche email se houver
  useEffect(() => {
    if (!email && historyEmail) setEmail(historyEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchHistory = useMemo(
    () => async () => {
      if (!isValidPartnerId) return;
      setHistoryLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          "partner-shop-list-orders",
          {
            body: {
              partnerId,
              fingerprint,
              email: historyEmail.trim() || undefined,
            },
          }
        );
        if (error) throw error;
        const d = data as { orders?: OrderHistoryItem[]; customerBalance?: CustomerBalance } | null;
        setHistory(d?.orders ?? []);
        if (d?.customerBalance) setCustomerBalance(d.customerBalance);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao carregar pedidos";
        toast({ title: "Falha", description: msg, variant: "destructive" });
      } finally {
        setHistoryLoading(false);
      }
    },
    [partnerId, fingerprint, historyEmail, isValidPartnerId, toast]
  );

  // Carrega histórico ao abrir tab e em foco/intervalo
  useEffect(() => {
    if (tab !== "pedidos") return;
    fetchHistory();
    const id = window.setInterval(fetchHistory, 15000);
    const onVis = () => { if (document.visibilityState === "visible") fetchHistory(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tab, fetchHistory]);

  // Carrega saldo do cliente uma vez ao montar (para mostrar no checkout)
  useEffect(() => {
    if (!isValidPartnerId) return;
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValidPartnerId]);

  // Auto-detecta pedido em aberto ao abrir página
  useEffect(() => {
    if (!isValidPartnerId) return;
    let activeId: string | null = null;
    try { activeId = localStorage.getItem(ACTIVE_ORDER_KEY); } catch { /* ignore */ }
    if (!activeId) return;
    (async () => {
      const { data } = await supabase.functions.invoke("partner-shop-check-status", {
        body: { orderId: activeId },
      });
      const d = data as OrderState | null;
      if (!d?.status) return;
      if (["delivered", "failed", "expired", "refunded"].includes(d.status)) {
        try { localStorage.removeItem(ACTIVE_ORDER_KEY); } catch { /* ignore */ }
        return;
      }
      setTrackingOrderId(activeId);
    })();
  }, [isValidPartnerId]);

  const { data: partner } = useQuery({
    queryKey: ["partner-public", partnerId],
    enabled: isValidPartnerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("parceiros")
        .select("user_id, nome, status, whatsapp")
        .eq("user_id", partnerId)
        .maybeSingle();
      return data;
    },
  });

  const { data: packs, isLoading } = useQuery({
    queryKey: ["partner-packs", partnerId],
    enabled: isValidPartnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_credit_packs")
        .select("*")
        .eq("partner_id", partnerId)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Pack[];
    },
  });

  // Polling de status enquanto pedido está em andamento (pix → paid → bot atribuído)
  useEffect(() => {
    if (!pix?.orderId) return;
    if (step !== "pix" && step !== "paid") return;
    try { (window as unknown as { __mf_tracking_id?: string }).__mf_tracking_id = pix.orderId; } catch { /* ignore */ }
    // Se o pedido já chegou em estado terminal, paramos.
    if (
      step === "paid" &&
      orderState &&
      ["delivered", "failed", "expired", "refunded"].includes(orderState.status)
    ) {
      return;
    }
    const fetchStatus = async () => {
      const { data } = await supabase.functions.invoke("partner-shop-check-status", {
        body: { orderId: pix.orderId },
      });
      const d = data as OrderState | null;
      if (!d?.status) return;
      setOrderState(d);
      if (d.status !== "pending" && step === "pix") setStep("paid");
    };
    // Realtime: dispara checagem quando o status muda
    const ch = supabase
      .channel(`order-rt-${pix.orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "partner_credit_orders", filter: `id=eq.${pix.orderId}` },
        () => { fetchStatus(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "execucoes_lovable" },
        () => { fetchStatus(); }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "farm_bots" },
        () => { fetchStatus(); }
      )
      .subscribe();
    fetchStatus();
    pollRef.current = window.setInterval(fetchStatus, 5000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      supabase.removeChannel(ch);
    };
  }, [step, pix?.orderId, orderState?.status]);

  const handleConfirm = () => {
    if (!selected) return;
    setConfirmOpen(false);
    setStep("form");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (workspace.trim().length < 2) {
      toast({
        title: "Workspace obrigatório",
        description: "Informe o nome exato do workspace Lovable de destino.",
        variant: "destructive",
      });
      return;
    }
    const taxDigits = taxId.replace(/\D/g, "");
    if (taxDigits.length !== 11 && taxDigits.length !== 14) {
      toast({
        title: "CPF/CNPJ inválido",
        description: "Use 11 dígitos para CPF ou 14 para CNPJ.",
        variant: "destructive",
      });
      return;
    }
    const whatsDigits = whatsapp.replace(/\D/g, "");
    if (whatsDigits.length < 10 || whatsDigits.length > 13) {
      toast({
        title: "WhatsApp inválido",
        description: "Informe DDD + número (ex: 11999999999).",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("partner-shop-create-pix", {
        body: {
          partnerId,
          packId: selected.id,
          customerName: name.trim(),
          customerEmail: email.trim().toLowerCase(),
          customerWhatsapp: whatsDigits,
          customerTaxId: taxDigits,
          targetWorkspace: workspace.trim(),
          clientFingerprint: fingerprint,
          useBalance,
        },
      });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            const msg =
              typeof body?.error === "string"
                ? body.error
                : body?.error
                ? JSON.stringify(body.error)
                : error.message;
            throw new Error(msg);
          } catch {
            throw error;
          }
        }
        throw error;
      }
      if (!data?.orderId) throw new Error("Resposta inválida");
      const pd = data as PixData;
      setPix(pd);
      // Se foi pago totalmente com saldo, pula a tela de Pix
      setStep(pd.paidWithBalance ? "paid" : "pix");
      if (pd.paidWithBalance) {
        toast({
          title: "Pedido criado com saldo",
          description: `Usamos ${pd.balanceAppliedCredits} créditos do seu saldo. Sem cobrança.`,
        });
      }
      try {
        localStorage.setItem(LAST_EMAIL_KEY, email.trim().toLowerCase());
        localStorage.setItem(ACTIVE_ORDER_KEY, pd.orderId);
      } catch { /* ignore */ }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar Pix";
      toast({ title: "Falha", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const copyPix = async () => {
    if (!pix?.copiaECola) return;
    await navigator.clipboard.writeText(pix.copiaECola);
    toast({ title: "Copiado!", description: "Cole no app do seu banco." });
  };

  const main = selected ?? packs?.[0];
  const discountPct = useMemo(() => {
    if (!main?.original_price_cents) return null;
    const d = 1 - main.price_cents / main.original_price_cents;
    return Math.round(d * 100);
  }, [main]);

  if (!isValidPartnerId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-bold">Link inválido</h1>
          <p className="text-sm text-muted-foreground">
            Este link de compra está incorreto ou incompleto. Peça ao parceiro o link correto, no formato <code>/comprar/&lt;ID&gt;</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="matrix-theme min-h-screen bg-background text-foreground relative overflow-x-hidden">
      <style>{matrixThemeStyle}</style>
      <MatrixRain />
      <div className="fixed inset-0 z-[1] bg-background/85 pointer-events-none" />
      <div className="fixed top-0 left-0 w-full h-[40vh] bg-gradient-to-b from-primary/10 to-transparent z-[2] pointer-events-none" />

      <main className="relative z-10 max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        <header className="rounded-2xl border-2 border-primary/30 bg-card/60 backdrop-blur p-6">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-primary/70">
            <Sparkles className="w-3.5 h-3.5" /> Créditos Lovable
          </div>
          <h1 className="mt-2 text-2xl md:text-4xl font-black font-mono">
            <GlitchText>
              {partner?.nome ? `${partner.nome.toUpperCase()} · CRÉDITOS LOVABLE` : "CRÉDITOS LOVABLE"}
            </GlitchText>
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
            Créditos entregues direto na sua workspace via convite da conta-mãe.
            Pedido único, sem assinatura, com reembolso proporcional automático.
          </p>
        </header>

        {/* Tabs principais */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as "comprar" | "pedidos")}>
          <TabsList className="grid grid-cols-2 w-full max-w-md mx-auto">
            <TabsTrigger value="comprar" className="gap-2">
              <ShoppingCart className="w-4 h-4" /> Comprar créditos
            </TabsTrigger>
            <TabsTrigger value="pedidos" className="gap-2">
              <History className="w-4 h-4" /> Meus pedidos
              {history && history.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                  {history.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="comprar" className="space-y-6 mt-6">
        {/* Requisitos */}
        <section className="rounded-2xl border-2 border-amber-500/30 bg-amber-500/5 backdrop-blur p-5">
          <div className="flex items-center justify-center gap-2 text-amber-400 text-xs font-mono uppercase tracking-[0.3em] mb-4">
            <AlertTriangle className="w-3.5 h-3.5" /> Requisitos importantes
          </div>
          <p className="text-center text-xs text-muted-foreground mb-4">
            Antes de comprar, <strong className="text-foreground">confirme que sua conta atende</strong> a essas duas regras.
            Caso contrário, a entrega <span className="text-destructive">não funciona</span> e o pedido será cancelado.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 text-destructive text-xs font-mono uppercase tracking-wider mb-1">
                <Ban className="w-3.5 h-3.5" /> Não pode ter
              </div>
              <div className="font-semibold">Assinatura PRO ativa</div>
              <p className="text-xs text-muted-foreground mt-1">
                Se você já tem PRO (500+ créditos próprios), nossa conta-mãe <strong>não consegue injetar</strong> os créditos.
              </p>
              <span className="inline-block mt-2 text-[10px] font-mono uppercase tracking-widest border border-destructive/40 text-destructive px-2 py-0.5 rounded">
                status esperado · FREE
              </span>
            </div>
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-mono uppercase tracking-wider mb-1">
                <Clock className="w-3.5 h-3.5" /> Limite por workspace
              </div>
              <div className="font-semibold">1 recarga ({main?.credits ?? 200}cr) a cada 24h <span className="underline">na mesma</span> workspace</div>
              <p className="text-xs text-muted-foreground mt-1">
                Quer mais? Crie <strong>OUTRA</strong> workspace no Lovable e recarregue ela. Forçar 2 pedidos seguidos na mesma workspace ={" "}
                <span className="text-destructive">CANCELADO e reembolsado</span>.
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-muted-foreground">
            <strong className="text-destructive">ATENÇÃO:</strong> pedidos feitos com a conta fora dessas regras são automaticamente <strong>cancelados</strong> e o valor volta pro seu saldo. Para mais {main?.credits ?? 200}cr no dia seguinte, é só fazer um novo pedido.
          </div>
        </section>

        {/* Pacotes */}
        {isLoading ? (
          <div className="text-center text-muted-foreground font-mono py-10">Carregando pacotes...</div>
        ) : !packs?.length ? (
          <div className="text-center text-muted-foreground font-mono py-10">
            Este parceiro ainda não publicou pacotes.
          </div>
        ) : (
          packs.map((p) => {
            const orig = p.original_price_cents;
            const discPct = orig ? Math.round((1 - p.price_cents / orig) * 100) : null;
            return (
              <section
                key={p.id}
                className="grid md:grid-cols-[1fr_360px] gap-4 rounded-2xl border-2 border-primary/30 bg-card/60 backdrop-blur p-6"
              >
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    {p.badge_label && (
                      <span className="text-[10px] font-mono uppercase tracking-widest border border-primary/40 bg-primary/10 text-primary px-2 py-0.5 rounded">
                        {p.badge_label}
                      </span>
                    )}
                    {discPct && (
                      <span className="text-[10px] font-mono uppercase tracking-widest bg-destructive/20 text-destructive px-2 py-0.5 rounded">
                        -{discPct}%
                      </span>
                    )}
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black font-mono leading-tight">
                    {p.credits} créditos na sua conta{" "}
                    <span className="text-primary">Lovable</span> por apenas {brl(p.price_cents)}.
                  </h2>
                  {p.description && (
                    <p className="text-sm text-muted-foreground mt-3">{p.description}</p>
                  )}
                  <ul className="mt-4 space-y-1 text-sm">
                    <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-none" /> Plano Pro ativado durante a entrega</li>
                    <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-none" /> {p.credits} créditos por pedido</li>
                    <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-none" /> Cobrança proporcional ao que for entregue</li>
                    <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-none" /> Reembolso automático se não completar</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-primary/30 bg-background/60 p-5 flex flex-col">
                  <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary/70 mb-2">// Pacote</div>
                  <div className="flex items-baseline gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <span className="text-4xl font-black font-mono text-primary">{p.credits}</span>
                    <span className="text-xs text-muted-foreground">créditos / pedido</span>
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    {orig && (
                      <span className="text-xs line-through text-muted-foreground">{brl(orig)}</span>
                    )}
                    {discPct && (
                      <span className="text-[10px] font-mono uppercase bg-destructive/20 text-destructive px-2 py-0.5 rounded">-{discPct}%</span>
                    )}
                  </div>
                  <div className="text-5xl font-black font-mono text-primary mt-1">
                    {brl(p.price_cents)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    ≈ {(p.price_cents / p.credits / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3 })} por crédito
                  </div>
                  <Button
                    size="lg"
                    className="mt-5 w-full text-base"
                    onClick={() => { setSelected(p); setConfirmOpen(true); }}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Comprar {p.credits} créditos · {brl(p.price_cents)}
                  </Button>
                </div>
              </section>
            );
          })
        )}

        <div className="flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground pt-4">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          Pagamento seguro via Pix · Liberação automática
        </div>
          </TabsContent>

          <TabsContent value="pedidos" className="space-y-4 mt-6">
            {customerBalance.credits > 0 && (
              <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 p-4 flex items-center gap-3">
                <Wallet className="w-6 h-6 text-emerald-400 flex-none" />
                <div className="flex-1">
                  <div className="text-xs font-mono uppercase tracking-widest text-emerald-400">
                    Saldo disponível
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    {customerBalance.credits} créditos
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Crédito gerado por pedidos não entregues integralmente. Use em um novo pedido para o mesmo e-mail ({customerBalance.email ?? "—"}) sem pagar de novo.
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setTab("comprar")}>
                  Usar saldo
                </Button>
              </div>
            )}
            <OrdersHistorySection
              history={history}
              loading={historyLoading}
              email={historyEmail}
              onEmailChange={setHistoryEmail}
              onRefresh={fetchHistory}
              onTrack={(item) => {
                setTrackingItem(item);
                setTrackingOrderId(item.id);
              }}
              onCancel={(id) => setConfirmCancelId(id)}
              onStop={(id) => setConfirmStopId(id)}
              partnerWhatsapp={partner?.whatsapp ?? null}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Confirmação */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Confirmar pedido
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-primary/70 mb-1">
                  Plano Pro + {selected.credits} créditos
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-primary font-mono">{selected.credits}</span>
                  {discountPct && (
                    <span className="text-[10px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded">-{discountPct}%</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">créditos · pagamento único por pedido</div>
                <div className="mt-2 flex items-baseline gap-2">
                  {selected.original_price_cents && (
                    <span className="text-xs line-through text-muted-foreground">{brl(selected.original_price_cents)}</span>
                  )}
                  <span className="text-2xl font-black font-mono text-primary">{brl(selected.price_cents)}</span>
                </div>
              </div>
              <div className="rounded-lg border border-primary/20 bg-card/60 p-3 text-xs space-y-1">
                <div className="font-semibold mb-1">Como funciona</div>
                <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                  <li>Você confirma o pedido abaixo.</li>
                  <li>Te entregamos o e-mail da conta-mãe na próxima tela.</li>
                  <li>Você convida esse e-mail como Owner em qualquer projeto seu.</li>
                  <li>Confirmamos o convite e os {selected.credits} créditos caem direto na sua conta.</li>
                </ol>
              </div>
              <Button className="w-full" size="lg" onClick={handleConfirm}>
                <Sparkles className="w-4 h-4 mr-2" /> Confirmar e gerar pedido
              </Button>
              {customerBalance.credits > 0 && (
                <label className="flex items-start gap-2 text-xs text-muted-foreground rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useBalance}
                    onChange={(e) => setUseBalance(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <strong className="text-emerald-400">Usar meu saldo ({customerBalance.credits} créditos)</strong>
                    {customerBalance.credits >= selected.credits ? (
                      <span className="block">Saldo cobre o pedido — você não paga nada via Pix.</span>
                    ) : (
                      <span className="block">
                        Aplicado: {customerBalance.credits} créditos.
                        Pix gerado só pelo restante ({selected.credits - customerBalance.credits} créditos).
                      </span>
                    )}
                  </span>
                </label>
              )}
              <p className="text-[10px] text-center text-muted-foreground">
                Cobrança proporcional · reembolso automático
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Form do cliente */}
      <Dialog open={step === "form"} onOpenChange={(o) => !o && setStep("browse")}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Seus dados</DialogTitle>
            <DialogDescription>
              Precisamos disso pra emitir o Pix e te enviar o convite da conta-mãe.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Nome completo</Label>
              <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>E-mail (Owner do workspace Lovable)</Label>
              <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>WhatsApp (com DDD)</Label>
                <Input
                  required
                  inputMode="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="11999999999"
                />
              </div>
              <div>
                <Label>CPF / CNPJ</Label>
                <Input required inputMode="numeric" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Workspace Lovable</Label>
              <Input
                required
                minLength={2}
                maxLength={200}
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="Ex: Minha Empresa, Projeto SaaS, Workspace do João"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Informe o nome <strong>exato</strong> do workspace Lovable onde os créditos devem ser adicionados.
              </p>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando Pix...</> : "Gerar Pix"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pix */}
      <Dialog open={step === "pix"} onOpenChange={(o) => !o && setStep("browse")}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" /> Pague via Pix
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR ou copie o código. Liberação automática.
            </DialogDescription>
          </DialogHeader>
          {pix && (
            <div className="flex flex-col items-center gap-4">
              <div className="bg-white p-3 rounded-lg">
                <img src={pix.qrCodeImage} alt="QR Code Pix" className="w-56 h-56 object-contain" />
              </div>
              <div className="w-full">
                <Label className="text-xs">Pix Copia e Cola</Label>
                <div className="flex gap-2 mt-1">
                  <Input readOnly value={pix.copiaECola} className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={copyPix}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Aguardando pagamento...
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pago */}
      <OrderTrackingDialog
        open={step === "paid"}
        onOpenChange={(o) => !o && setStep("browse")}
        order={orderState}
        fallbackWorkspace={workspace.trim() || null}
        fallbackCredits={selected?.credits ?? null}
        fallbackAmountCents={selected?.price_cents ?? null}
        onCopyEmail={async (email) => {
          await navigator.clipboard.writeText(email);
          toast({ title: "E-mail copiado!" });
        }}
      />

      {/* Tracking de pedido vindo do histórico */}
      <HistoryTrackingDialog
        orderId={trackingOrderId}
        initialItem={trackingItem}
        onOpenChange={(o) => {
          if (!o) {
            setTrackingOrderId(null);
            setTrackingItem(null);
          }
        }}
      />

      {/* Confirmação de cancelamento */}
      <AlertDialog
        open={!!confirmCancelId}
        onOpenChange={(o) => !o && setConfirmCancelId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              Só é possível cancelar enquanto o pagamento ainda não foi confirmado.
              Depois de pago, fale com o suporte para qualquer ajuste.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!cancelingId}
              onClick={async () => {
                if (!confirmCancelId) return;
                setCancelingId(confirmCancelId);
                try {
                  const { error } = await supabase.functions.invoke(
                    "partner-shop-cancel-order",
                    { body: { orderId: confirmCancelId, fingerprint } }
                  );
                  if (error) throw error;
                  toast({ title: "Pedido cancelado" });
                  try {
                    const active = localStorage.getItem(ACTIVE_ORDER_KEY);
                    if (active === confirmCancelId) localStorage.removeItem(ACTIVE_ORDER_KEY);
                  } catch { /* ignore */ }
                  setConfirmCancelId(null);
                  fetchHistory();
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Erro";
                  toast({ title: "Falha", description: msg, variant: "destructive" });
                } finally {
                  setCancelingId(null);
                }
              }}
            >
              {cancelingId ? "Cancelando..." : "Sim, cancelar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de parar farm */}
      <AlertDialog
        open={!!confirmStopId}
        onOpenChange={(o) => !o && setConfirmStopId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Parar farm e receber saldo?</AlertDialogTitle>
            <AlertDialogDescription>
              O que já foi farmado fica entregue na sua workspace. Os créditos restantes
              voltam como <strong>saldo</strong> e você pode usar em um novo pedido sem pagar de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!stoppingId}
              onClick={async () => {
                if (!confirmStopId) return;
                setStoppingId(confirmStopId);
                try {
                  const { data, error } = await supabase.functions.invoke(
                    "partner-shop-stop-order",
                    { body: { orderId: confirmStopId, fingerprint } }
                  );
                  if (error) throw error;
                  const refunded = (data as { refundedCredits?: number })?.refundedCredits ?? 0;
                  toast({
                    title: "Farm parado",
                    description: refunded > 0
                      ? `${refunded} créditos voltaram para o seu saldo.`
                      : "Pedido encerrado.",
                  });
                  setConfirmStopId(null);
                  fetchHistory();
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Erro";
                  toast({ title: "Falha", description: msg, variant: "destructive" });
                } finally {
                  setStoppingId(null);
                }
              }}
            >
              {stoppingId ? "Parando..." : "Sim, parar e receber saldo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Tela de acompanhamento do pedido (pós-pagamento)
// ============================================================

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Aguardando pagamento Pix",
  paid: "Pagamento confirmado",
  queued: "Na fila para receber um bot",
  processing: "Processando seu pedido",
  delivered: "Créditos entregues",
  failed: "Não foi possível entregar os créditos",
  expired: "Pagamento expirado",
  refunded: "Pedido reembolsado",
};

function statusHeadline(s: OrderState | null): string {
  if (!s) return "Carregando status do pedido...";
  if (s.status === "processing" && s.assignedBotId) {
    return "Aguardando convite do bot ou processamento";
  }
  if (s.status === "processing" && !s.assignedBotId) {
    return "Aguardando atribuição de bot";
  }
  return STATUS_LABEL[s.status];
}

function OrderTrackingDialog({
  open, onOpenChange, order,
  fallbackWorkspace, fallbackCredits, fallbackAmountCents,
  onCopyEmail,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: OrderState | null;
  fallbackWorkspace: string | null;
  fallbackCredits: number | null;
  fallbackAmountCents: number | null;
  onCopyEmail: (email: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <OrderTrackingInline
          order={order}
          fallbackWorkspace={fallbackWorkspace}
          fallbackCredits={fallbackCredits}
          fallbackAmountCents={fallbackAmountCents}
          onCopyEmail={onCopyEmail}
        />
      </DialogContent>
    </Dialog>
  );
}
// ============================================================
// Histórico de pedidos (tab "Meus pedidos")
// ============================================================

function OrdersHistorySection({
  history, loading, email, onEmailChange, onRefresh,
  onTrack, onCancel, onStop, partnerWhatsapp,
}: {
  history: OrderHistoryItem[] | null;
  loading: boolean;
  email: string;
  onEmailChange: (v: string) => void;
  onRefresh: () => void;
  onTrack: (item: OrderHistoryItem) => void;
  onCancel: (id: string) => void;
  onStop: (id: string) => void;
  partnerWhatsapp: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-primary/30 bg-card/60 backdrop-blur p-5">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <Label className="text-xs">Ver pedidos por e-mail (opcional)</Label>
            <Input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              onBlur={onRefresh}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Pedidos feitos neste navegador aparecem automaticamente. Use o e-mail
              se trocou de dispositivo.
            </p>
          </div>
          <Button variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {loading && !history ? (
        <div className="text-center text-muted-foreground font-mono py-10">
          Carregando seus pedidos...
        </div>
      ) : !history?.length ? (
        <div className="text-center text-muted-foreground font-mono py-10 rounded-2xl border border-dashed border-primary/20 bg-card/40">
          Nenhum pedido encontrado neste dispositivo.
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((o) => {
            const badge = STATUS_BADGE[o.status];
            const canCancel = o.status === "pending" && o.ownDevice;
            const canTrack = ["pending", "paid", "queued", "processing"].includes(o.status);
            return (
              <div
                key={o.id}
                className="rounded-xl border border-primary/20 bg-card/60 p-4 flex flex-col md:flex-row md:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-mono uppercase tracking-wider border px-2 py-0.5 rounded ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{timeAgo(o.createdAt)}</span>
                    {!o.ownDevice && (
                      <span className="text-[10px] font-mono uppercase tracking-wider border border-muted text-muted-foreground px-2 py-0.5 rounded">
                        outro dispositivo
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 font-bold">
                    {o.credits} créditos · {brl(o.amountCents)}
                  </div>
                  <div className="text-xs text-muted-foreground break-all">
                    Workspace: <span className="font-mono text-foreground">{o.targetWorkspace ?? "—"}</span>
                  </div>
                  {o.botEmail && (
                    <div className="text-xs text-muted-foreground break-all">
                      Bot: <span className="font-mono text-primary">{o.botEmail}</span>
                    </div>
                  )}
                  {o.progress && ["paid","queued","processing"].includes(o.status) && (o.progress.farmed > 0 || o.progress.lastMessage) && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                        <span>{o.progress.farmed} / {o.credits} créditos</span>
                        <span>{o.progress.percent}%</span>
                      </div>
                      <Progress value={o.progress.percent} className="h-1.5" />
                      {o.progress.lastMessage && (
                        <div
                          className={`text-[11px] line-clamp-2 ${
                            o.progress.lastStatus === "limite"
                              ? "text-amber-400"
                              : o.progress.lastStatus === "falha" || o.progress.lastStatus === "erro"
                              ? "text-destructive"
                              : o.progress.lastStatus === "sucesso" || o.progress.lastStatus === "concluido"
                              ? "text-emerald-400"
                              : "text-primary"
                          }`}
                          title={o.progress.lastMessage}
                        >
                          Bot: {o.progress.lastMessage}
                        </div>
                      )}
                    </div>
                  )}
                  {o.status === "failed" && o.failedReason && (
                    <div className="text-xs text-destructive mt-1">{o.failedReason}</div>
                  )}
                  {o.status === "refunded" && (
                    <div className="text-xs text-emerald-400 mt-1">
                      {o.refundedCredits ?? 0} créditos voltaram como saldo
                      {o.failedReason ? ` · ${o.failedReason}` : ""}
                    </div>
                  )}
                  {(o.balanceAppliedCredits ?? 0) > 0 && (
                    <div className="text-[11px] text-emerald-400/80 mt-1">
                      Pago com {o.balanceAppliedCredits} créditos do seu saldo
                    </div>
                  )}
                  {o.status === "delivered" && o.deliveredAt && (
                    <div className="text-xs text-emerald-400 mt-1">
                      Entregue em {new Date(o.deliveredAt).toLocaleString("pt-BR")}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch md:w-44">
                  {canTrack && (
                    <Button size="sm" onClick={() => onTrack(o)}>
                      <Eye className="w-4 h-4 mr-1.5" />
                      {o.status === "pending" ? "Ver Pix" : "Acompanhar"}
                    </Button>
                  )}
                  {!canTrack && (
                    <Button size="sm" variant="outline" onClick={() => onTrack(o)}>
                      <Eye className="w-4 h-4 mr-1.5" /> Detalhes
                    </Button>
                  )}
                  {canCancel && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => onCancel(o.id)}>
                      <Trash2 className="w-4 h-4 mr-1.5" /> Cancelar
                    </Button>
                  )}
                  {["paid","queued","processing"].includes(o.status) && o.ownDevice && !o.stopRequestedAt && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => onStop(o.id)}>
                      <StopCircle className="w-4 h-4 mr-1.5" /> Parar farm
                    </Button>
                  )}
                  {(o.status === "failed" || o.status === "expired" || o.status === "refunded") && partnerWhatsapp && (
                    <a
                      href={`https://wa.me/${partnerWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá! Preciso de ajuda com o pedido ${o.id}.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center text-xs underline text-primary"
                    >
                      Falar com suporte
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Tracking de pedido vindo do histórico (recupera Pix em aberto)
// ============================================================

function HistoryTrackingDialog({
  orderId, initialItem, onOpenChange,
}: {
  orderId: string | null;
  initialItem: OrderHistoryItem | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<OrderState | null>(null);
  const [pix, setPix] = useState<{ qr: string | null; copy: string | null } | null>(null);

  useEffect(() => {
    if (!orderId) {
      setState(null);
      setPix(null);
      return;
    }
    try { (window as unknown as { __mf_tracking_id?: string }).__mf_tracking_id = orderId; } catch { /* ignore */ }
    if (initialItem) {
      setPix({ qr: initialItem.pixQrcode, copy: initialItem.pixCopyPaste });
    }
    const fetchStatus = async () => {
      const { data } = await supabase.functions.invoke("partner-shop-check-status", {
        body: { orderId },
      });
      const d = data as OrderState | null;
      if (d?.status) setState(d);
    };
    fetchStatus();
    const ch = supabase
      .channel(`hist-rt-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "partner_credit_orders", filter: `id=eq.${orderId}` },
        () => fetchStatus()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "execucoes_lovable" },
        () => fetchStatus()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "farm_bots" },
        () => fetchStatus()
      )
      .subscribe();
    const id = window.setInterval(fetchStatus, 6000);
    return () => {
      window.clearInterval(id);
      supabase.removeChannel(ch);
      try { delete (window as unknown as { __mf_tracking_id?: string }).__mf_tracking_id; } catch { /* ignore */ }
    };
  }, [orderId, initialItem]);

  const status = state?.status ?? initialItem?.status ?? null;
  const showPix = status === "pending" && pix?.copy;

  if (!orderId) return null;

  return (
    <Dialog open={!!orderId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {showPix ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-primary" /> Pague via Pix
              </DialogTitle>
              <DialogDescription>
                Escaneie o QR Code ou copie o código abaixo. Liberação automática após o pagamento.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 mt-2">
              {pix?.qr && (
                <div className="bg-white p-3 rounded-lg">
                  <img src={pix.qr} alt="QR Code Pix" className="w-56 h-56 object-contain" />
                </div>
              )}
              {pix?.copy && (
                <div className="w-full">
                  <Label className="text-xs">Pix Copia e Cola</Label>
                  <div className="flex gap-2 mt-1">
                    <Input readOnly value={pix.copy} className="font-mono text-xs" />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(pix.copy!);
                        toast({ title: "Copiado!" });
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Aguardando pagamento...
              </div>
            </div>
          </>
        ) : (
          <OrderTrackingInline
            order={state}
            fallbackWorkspace={initialItem?.targetWorkspace ?? null}
            fallbackCredits={initialItem?.credits ?? null}
            fallbackAmountCents={initialItem?.amountCents ?? null}
            onCopyEmail={async (e) => {
              await navigator.clipboard.writeText(e);
              toast({ title: "E-mail copiado!" });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Versão "inline" (sem Dialog próprio) do tracking, reaproveitando o body
function OrderTrackingInline({
  order, fallbackWorkspace, fallbackCredits, fallbackAmountCents, onCopyEmail,
}: {
  order: OrderState | null;
  fallbackWorkspace: string | null;
  fallbackCredits: number | null;
  fallbackAmountCents: number | null;
  onCopyEmail: (email: string) => void;
}) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [localConfirmedAt, setLocalConfirmedAt] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const status = order?.status;
  const botEmail = order?.botEmail ?? null;
  const workspace = order?.targetWorkspace ?? fallbackWorkspace ?? null;
  const credits = order?.credits ?? fallbackCredits ?? null;
  const amount = order?.amountCents ?? fallbackAmountCents ?? null;
  const inviteConfirmedAt = order?.botInviteConfirmedAt ?? localConfirmedAt;
  const progress = order?.progress ?? null;
  const isTerminalSuccess = status === "delivered";
  const isTerminalFailure = status === "failed" || status === "expired" || status === "refunded";
  const showBotBlock = !!botEmail && (status === "processing" || status === "paid" || status === "queued");
  const headerIcon = isTerminalSuccess ? <CheckCircle2 className="w-6 h-6" />
    : isTerminalFailure ? <XCircle className="w-6 h-6" />
    : showBotBlock ? <Bot className="w-6 h-6" />
    : <Hourglass className="w-6 h-6 animate-pulse" />;
  const headerTone = isTerminalFailure ? "text-destructive" : "text-primary";
  const showProgress =
    !!inviteConfirmedAt &&
    (status === "paid" || status === "queued" || status === "processing");
  const canStop =
    (status === "paid" || status === "queued" || status === "processing") &&
    !order?.stopRequestedAt;

  const confirmInvite = async () => {
    if (!order) return;
    // Recupera orderId do contexto via window? Não temos. Usamos progresso/state? Precisamos do id.
    // O id chega via order? Não está em OrderState. Usamos localStorage active ou vem do parent.
    // Solução: id é mantido em ACTIVE_ORDER_KEY ou no HistoryDialog - usamos atributo em window via callback.
    // Adiamos: usamos data-order-id via DOM? Melhor: subir prop. Como fallback, lê localStorage.
    let orderId: string | null = null;
    try { orderId = localStorage.getItem("mf_active_order_id"); } catch { /* ignore */ }
    // Se HistoryDialog setou um id de tracking, está em window.__mf_tracking_id
    const winId = (window as unknown as { __mf_tracking_id?: string }).__mf_tracking_id;
    if (winId) orderId = winId;
    if (!orderId) {
      toast({ title: "Não foi possível identificar o pedido", variant: "destructive" });
      return;
    }
    let fp = "";
    try { fp = localStorage.getItem("mf_client_fp") ?? ""; } catch { /* ignore */ }
    setConfirming(true);
    try {
      const { error } = await supabase.functions.invoke("partner-shop-confirm-invite", {
        body: { orderId, fingerprint: fp },
      });
      if (error) throw error;
      setLocalConfirmedAt(new Date().toISOString());
      toast({ title: "Convite confirmado!", description: "O farm vai começar em instantes." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast({ title: "Falha ao confirmar", description: msg, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className={`flex items-center gap-2 ${headerTone}`}>
          {headerIcon} {statusHeadline(order)}
        </DialogTitle>
        <DialogDescription>
          {isTerminalSuccess
            ? "Seus créditos já foram adicionados ao workspace informado."
            : isTerminalFailure
            ? "Veja os detalhes abaixo. Em caso de cobrança, o reembolso é automático."
            : showProgress
            ? "Estamos farmando seus créditos. Acompanhe o progresso em tempo real abaixo."
            : showBotBlock
            ? "Falta um passo manual: convide o bot abaixo como Owner do seu workspace Lovable."
            : "Estamos preparando seu pedido. Esta tela atualiza sozinha."}
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-lg border border-primary/20 bg-card/60 p-3 text-xs grid grid-cols-2 gap-2">
        <div><div className="text-muted-foreground">Workspace</div><div className="font-mono font-semibold break-all">{workspace ?? "—"}</div></div>
        <div><div className="text-muted-foreground">Créditos</div><div className="font-mono font-semibold">{credits ?? "—"}</div></div>
        <div><div className="text-muted-foreground">Valor</div><div className="font-mono font-semibold">{amount != null ? brl(amount) : "—"}</div></div>
        <div><div className="text-muted-foreground">Status</div><div className="font-mono font-semibold">{status ? STATUS_LABEL[status] : "—"}</div></div>
      </div>

      {/* Painel de progresso em tempo real */}
      {showProgress && progress && (
        <div className="rounded-lg border-2 border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Farm em andamento
            </div>
            <div className="text-xs text-muted-foreground">
              Convite confirmado {timeAgo(inviteConfirmedAt)}
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <div className="font-mono text-2xl font-bold text-emerald-400">
                {progress.farmed}<span className="text-base text-muted-foreground"> / {progress.target}</span>
              </div>
              <div className="font-mono text-sm text-emerald-400">{progress.percent}%</div>
            </div>
            <Progress value={progress.percent} className="h-2" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-border bg-background/40 p-2">
              <div className="text-muted-foreground">Bot</div>
              <div className="font-mono">
                {order?.botStatus === "busy" ? (
                  <span className="text-emerald-400 inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> trabalhando
                  </span>
                ) : order?.botStatus ?? "—"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                heartbeat {timeAgo(order?.botHeartbeatAt ?? null)}
              </div>
            </div>
            <div className="rounded border border-border bg-background/40 p-2">
              <div className="text-muted-foreground">Tentativas</div>
              <div className="font-mono text-base font-semibold">{progress.attempts}</div>
              <div className="text-[10px] text-muted-foreground">
                último evento {timeAgo(progress.lastEventAt)}
              </div>
            </div>
          </div>
          {progress.currentExecution && (
            <div className="rounded border border-border bg-background/40 p-2 text-xs">
              <div className="text-muted-foreground mb-0.5">Tentativa atual</div>
              <div className="font-mono">
                {progress.currentExecution.status === "em_andamento" && (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> farmando…
                  </span>
                )}
                {progress.currentExecution.status === "limite" && (
                  <span className="text-amber-400">Lovable bloqueou — próxima tentativa automática</span>
                )}
                {(progress.currentExecution.status === "sucesso" || progress.currentExecution.status === "concluido") && (
                  <span className="text-emerald-400">+{progress.currentExecution.creditosAdicionados ?? 0} créditos nesta tentativa</span>
                )}
                {(progress.currentExecution.status === "falha" || progress.currentExecution.status === "erro") && (
                  <span className="text-destructive">Falhou: {progress.currentExecution.erro ?? "erro"}</span>
                )}
              </div>
              {progress.currentExecution.erro && progress.currentExecution.status !== "falha" && progress.currentExecution.status !== "erro" && (
                <div className="mt-1 text-[11px] text-muted-foreground break-words">
                  {progress.currentExecution.erro}
                </div>
              )}
            </div>
          )}
          {progress.recent.length > 1 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Ver últimas tentativas</summary>
              <ul className="mt-2 space-y-1">
                {progress.recent.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 font-mono">
                    <span className="mt-0.5">
                      {r.status === "sucesso" || r.status === "concluido" ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : r.status === "limite" ? (
                        <Clock className="w-3 h-3 text-amber-400" />
                      ) : r.status === "em_andamento" ? (
                        <Loader2 className="w-3 h-3 text-primary animate-spin" />
                      ) : (
                        <XCircle className="w-3 h-3 text-destructive" />
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-foreground">+{r.creditosAdicionados ?? 0}</span>
                      <span className="text-muted-foreground ml-1">{timeAgo(r.atualizadoEm)}</span>
                      {r.erro && (
                        <span className="block text-[11px] text-muted-foreground/90 break-words whitespace-normal">
                          {r.erro}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {showBotBlock && botEmail && (
        <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-3 mt-3">
          <div className="text-xs font-mono uppercase tracking-widest text-primary flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> Próximo passo: convide o bot no seu workspace Lovable
          </div>
          <p className="text-sm text-muted-foreground">
            Entre no Lovable, abra o workspace informado e <strong>convide o e-mail abaixo como Owner</strong>.
            O sistema <strong>não</strong> envia esse convite automaticamente.
          </p>
          <div className="rounded border border-primary/30 bg-background/60 p-3">
            <div className="text-[10px] font-mono uppercase text-primary/70 mb-1">E-mail do bot</div>
            <div className="font-mono text-base font-bold text-primary break-all">{botEmail}</div>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => onCopyEmail(botEmail)}>
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar e-mail do bot
            </Button>
          </div>
          <ol className="list-decimal pl-5 space-y-1 text-xs text-muted-foreground">
            <li>Acesse <a href="https://lovable.dev" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">lovable.dev <ExternalLink className="w-3 h-3" /></a></li>
            <li>Abra o workspace informado ({workspace ?? "—"})</li>
            <li>Vá em <strong>Settings → Members</strong></li>
            <li>Convide o e-mail do bot como <strong>Owner</strong></li>
            <li>Volte aqui e aguarde — atualiza sozinho</li>
          </ol>
          {!inviteConfirmedAt ? (
            <Button
              className="w-full"
              onClick={confirmInvite}
              disabled={confirming}
            >
              {confirming ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Confirmando...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-2" /> Já adicionei o bot como Owner</>
              )}
            </Button>
          ) : (
            <div className="rounded border border-emerald-500/40 bg-emerald-500/5 p-2 text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Convite confirmado {timeAgo(inviteConfirmedAt)} — iniciando farm.
            </div>
          )}
        </div>
      )}
      {(status === "paid" || status === "queued" || (status === "processing" && !order?.assignedBotId)) && !showBotBlock && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
          Estamos preparando seu pedido. Se demorar, fale com o suporte.
        </div>
      )}
      {isTerminalSuccess && (
        <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <CheckCircle2 className="w-4 h-4" /> Créditos entregues!
          </div>
          {order?.deliveredAt && (
            <div className="text-xs text-muted-foreground">Entregue em {new Date(order.deliveredAt).toLocaleString("pt-BR")}</div>
          )}
        </div>
      )}
      {isTerminalFailure && status && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
          <div className="flex items-center gap-2 text-destructive font-semibold">
            <XCircle className="w-4 h-4" /> {STATUS_LABEL[status]}
          </div>
          {order?.failedReason && <div className="text-xs text-muted-foreground">{order.failedReason}</div>}
          <div className="text-xs text-muted-foreground">Em caso de pagamento confirmado, o reembolso é automático.</div>
        </div>
      )}
    </>
  );
}
