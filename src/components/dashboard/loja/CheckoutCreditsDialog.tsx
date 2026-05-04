import { useEffect, useRef, useState } from "react";
import { Copy, CheckCircle2, Loader2, QrCode, Coins } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CreditPack, formatBRL } from "@/lib/credit-packs";
import { useAuth } from "@/hooks/useAuth";

type Step = "form" | "pix" | "paid";

type PixData = {
  txId: string;
  qrCodeImage: string;
  copiaECola: string;
  amountCents: number;
  expiresAt?: string;
};

export default function CheckoutCreditsDialog({
  pack,
  open,
  onOpenChange,
  onPaid,
}: {
  pack: CreditPack | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPaid?: (creditsAdded: number) => void;
}) {
  const { toast } = useToast();
  const { parceiro } = useAuth();
  const [step, setStep] = useState<Step>("form");
  const [whatsapp, setWhatsapp] = useState(parceiro?.whatsapp ?? "");
  const [taxId, setTaxId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pix, setPix] = useState<PixData | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("form");
      setPix(null);
      setSubmitting(false);
      setTaxId("");
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } else {
      setWhatsapp(parceiro?.whatsapp ?? "");
    }
  }, [open, parceiro?.whatsapp]);

  useEffect(() => {
    if (step !== "pix" || !pix?.txId) return;
    pollRef.current = window.setInterval(async () => {
      const { data, error } = await supabase.functions.invoke(
        "abacatepay-check-status",
        { body: { txId: pix.txId } }
      );
      if (error) return;
      if (data?.status === "paid") {
        if (pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setStep("paid");
        onPaid?.(Number(data?.creditsAdded) || pack?.credits || 0);
      }
    }, 5000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [step, pix?.txId, onPaid, pack?.credits]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pack) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "loja-create-pix",
        {
          body: {
            packId: pack.id,
            customerWhatsapp: whatsapp.trim() || undefined,
            customerTaxId: taxId.replace(/\D/g, ""),
          },
        }
      );
      if (error) throw error;
      if (!data?.txId) throw new Error("Resposta inválida do gateway");
      setPix(data as PixData);
      setStep("pix");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar Pix";
      toast({ title: "Falha no checkout", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const copyPix = async () => {
    if (!pix?.copiaECola) return;
    await navigator.clipboard.writeText(pix.copiaECola);
    toast({ title: "Copiado!", description: "Cole no app do seu banco." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-2 border-primary/40 bg-card/90 backdrop-blur-xl shadow-[0_0_40px_hsl(var(--primary)/0.25)]">
        {step === "form" && pack && (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono uppercase tracking-wider text-primary">
                Comprar {pack.name}
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">
                <span className="text-foreground">{pack.credits.toLocaleString("pt-BR")}</span>{" "}
                créditos por <strong className="text-primary">{formatBRL(pack.price_cents)}</strong>.
                Adicionados ao seu farm imediatamente após o Pix.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div>
                <Label htmlFor="ck-wa" className="font-mono uppercase text-[10px] tracking-wider text-primary/80">
                  WhatsApp (opcional)
                </Label>
                <Input
                  id="ck-wa"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="bg-background/60 border-primary/30 font-mono"
                />
              </div>
              <div>
                <Label htmlFor="ck-cpf" className="font-mono uppercase text-[10px] tracking-wider text-primary/80">
                  CPF
                </Label>
                <Input
                  id="ck-cpf"
                  required
                  inputMode="numeric"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="000.000.000-00"
                  className="bg-background/60 border-primary/30 font-mono"
                />
                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                  Obrigatório pelo gateway de pagamento (Pix).
                </p>
              </div>
              <Button
                type="submit"
                className="w-full font-bold uppercase tracking-[0.15em]"
                size="lg"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando Pix...
                  </>
                ) : (
                  <>Gerar Pix de {formatBRL(pack.price_cents)}</>
                )}
              </Button>
            </form>
          </>
        )}

        {step === "pix" && pix && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-mono uppercase tracking-wider text-primary">
                <QrCode className="w-5 h-5" /> Pague via Pix
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">
                Escaneie o QR Code ou copie o código. Liberação automática.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 mt-2">
              <div className="bg-white p-3 rounded-lg border-2 border-primary/40 shadow-[0_0_30px_hsl(var(--primary)/0.3)]">
                <img
                  src={pix.qrCodeImage}
                  alt="QR Code Pix"
                  className="w-56 h-56 object-contain"
                />
              </div>
              <div className="w-full">
                <Label className="text-[10px] font-mono uppercase tracking-wider text-primary/80">
                  Pix Copia e Cola
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    readOnly
                    value={pix.copiaECola}
                    className="font-mono text-xs bg-background/60 border-primary/30"
                  />
                  <Button type="button" variant="outline" onClick={copyPix} className="border-primary/40">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-primary/80 uppercase tracking-wider">
                <Loader2 className="w-4 h-4 animate-spin" />
                Aguardando pagamento...
              </div>
            </div>
          </>
        )}

        {step === "paid" && pack && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary font-mono uppercase tracking-wider">
                <CheckCircle2 className="w-6 h-6" /> Pagamento confirmado!
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">
                <span className="inline-flex items-center gap-1 text-primary">
                  <Coins className="w-3.5 h-3.5" />
                  +{pack.credits.toLocaleString("pt-BR")} créditos
                </span>{" "}
                adicionados ao seu farm.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <Button
                className="w-full font-bold uppercase tracking-[0.15em]"
                onClick={() => onOpenChange(false)}
              >
                Continuar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}