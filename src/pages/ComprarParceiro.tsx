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
  CheckCircle2, Copy, Loader2, QrCode, Mail,
} from "lucide-react";

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
type PixData = { orderId: string; txId: string; qrCodeImage: string; copiaECola: string };

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
  const [botEmail, setBotEmail] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    document.title = "Comprar créditos · Matrix";
  }, []);

  const { data: partner } = useQuery({
    queryKey: ["partner-public", partnerId],
    enabled: isValidPartnerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("parceiros")
        .select("user_id, nome, status")
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

  // Polling de status quando estamos na etapa pix
  useEffect(() => {
    if (step !== "pix" || !pix?.orderId) return;
    // Realtime: avança imediatamente quando o status muda
    const ch = supabase
      .channel(`order-rt-${pix.orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "partner_credit_orders", filter: `id=eq.${pix.orderId}` },
        (payload) => {
          const next = payload.new as { status?: string };
          if (next?.status && ["paid", "queued", "processing", "delivered"].includes(next.status)) {
            supabase.functions
              .invoke("partner-shop-check-status", { body: { orderId: pix.orderId } })
              .then(({ data }) => {
                setBotEmail((data as { botEmail?: string | null })?.botEmail ?? null);
              });
            setStep("paid");
          }
        }
      )
      .subscribe();
    pollRef.current = window.setInterval(async () => {
      const { data } = await supabase.functions.invoke("partner-shop-check-status", {
        body: { orderId: pix.orderId },
      });
      if (!data) return;
      const s = (data as { status?: string; botEmail?: string | null }).status;
      if (s && ["paid", "queued", "processing", "delivered"].includes(s)) {
        setBotEmail((data as { botEmail?: string | null }).botEmail ?? null);
        if (pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setStep("paid");
      }
    }, 4000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      supabase.removeChannel(ch);
    };
  }, [step, pix?.orderId]);

  const handleConfirm = () => {
    if (!selected) return;
    setConfirmOpen(false);
    setStep("form");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const taxDigits = taxId.replace(/\D/g, "");
    if (taxDigits.length !== 11 && taxDigits.length !== 14) {
      toast({
        title: "CPF/CNPJ inválido",
        description: "Use 11 dígitos para CPF ou 14 para CNPJ.",
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
          customerWhatsapp: whatsapp.trim() || undefined,
          customerTaxId: taxDigits,
          targetWorkspace: workspace.trim() || undefined,
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
      setPix(data as PixData);
      setStep("pix");
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
                <Label>WhatsApp</Label>
                <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(opcional)" />
              </div>
              <div>
                <Label>CPF / CNPJ</Label>
                <Input required inputMode="numeric" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Workspace alvo (opcional)</Label>
              <Input value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="nome ou link" />
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
      <Dialog open={step === "paid"} onOpenChange={(o) => !o && setStep("browse")}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="w-6 h-6" /> Pagamento confirmado!
            </DialogTitle>
            <DialogDescription>
              Agora convide a conta-mãe abaixo como <strong>Owner</strong> do seu workspace Lovable.
              Assim que aceitarmos, os créditos caem na sua conta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {botEmail ? (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-primary/70 mb-1">
                  <Mail className="w-3.5 h-3.5" /> E-mail da conta-mãe
                </div>
                <div className="font-mono text-lg font-bold text-primary break-all">{botEmail}</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={async () => {
                    await navigator.clipboard.writeText(botEmail);
                    toast({ title: "Copiado!" });
                  }}
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar e-mail
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Seu pedido entrou na fila. Em instantes te enviaremos o e-mail da conta-mãe por aqui e por e-mail.
              </div>
            )}
            <div className="rounded-lg border border-primary/20 bg-card/60 p-3 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-primary" /> Próximos passos
              </div>
              <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                <li>Abra seu workspace no Lovable.</li>
                <li>Convide o e-mail acima como <strong>Owner</strong>.</li>
                <li>Aguarde — vamos aceitar e injetar os créditos automaticamente.</li>
              </ol>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}