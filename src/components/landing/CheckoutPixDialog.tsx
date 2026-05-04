import { useEffect, useRef, useState } from "react";
import { Copy, CheckCircle2, Loader2, QrCode } from "lucide-react";
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

type Step = "form" | "pix" | "paid";

type PixData = {
  txId: string;
  qrCodeImage: string; // base64 data URL or url
  copiaECola: string;
  amountCents: number;
  expiresAt?: string;
};

export default function CheckoutPixDialog({
  pack,
  open,
  onOpenChange,
}: {
  pack: CreditPack | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [taxId, setTaxId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pix, setPix] = useState<PixData | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("form");
      setPix(null);
      setSubmitting(false);
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [open]);

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
      }
    }, 5000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [step, pix?.txId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pack) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "abacatepay-create-pix",
        {
          body: {
            packId: pack.id,
            customerName: name.trim(),
            customerEmail: email.trim().toLowerCase(),
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
      <DialogContent className="max-w-md">
        {step === "form" && pack && (
          <>
            <DialogHeader>
              <DialogTitle>Comprar {pack.name}</DialogTitle>
              <DialogDescription>
                {pack.credits.toLocaleString("pt-BR")} créditos por{" "}
                <strong>{formatBRL(pack.price_cents)}</strong>. Pagamento via Pix.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div>
                <Label htmlFor="ck-name">Nome completo</Label>
                <Input
                  id="ck-name"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                />
              </div>
              <div>
                <Label htmlFor="ck-email">E-mail</Label>
                <Input
                  id="ck-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Sua licença será vinculada a este e-mail.
                </p>
              </div>
              <div>
                <Label htmlFor="ck-wa">WhatsApp (opcional)</Label>
                <Input
                  id="ck-wa"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div>
                <Label htmlFor="ck-cpf">CPF</Label>
                <Input
                  id="ck-cpf"
                  required
                  inputMode="numeric"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="000.000.000-00"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Obrigatório pelo gateway de pagamento (Pix).
                </p>
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
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
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-primary" /> Pague via Pix
              </DialogTitle>
              <DialogDescription>
                Escaneie o QR Code ou copie o código abaixo. Liberação automática.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 mt-2">
              <div className="bg-white p-3 rounded-lg">
                <img
                  src={pix.qrCodeImage}
                  alt="QR Code Pix"
                  className="w-56 h-56 object-contain"
                />
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
                <Loader2 className="w-4 h-4 animate-spin" />
                Aguardando pagamento...
              </div>
            </div>
          </>
        )}

        {step === "paid" && pack && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="w-6 h-6" /> Pagamento confirmado!
              </DialogTitle>
              <DialogDescription>
                Sua licença de {pack.credits.toLocaleString("pt-BR")} créditos foi criada
                e vinculada ao e-mail <strong>{email}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <p className="text-sm">
                Acesse o painel com este e-mail para começar a usar seus créditos.
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  window.location.href = "/auth";
                }}
              >
                Acessar painel
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}