import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CreditPack, formatBRL, pricePerCredit } from "@/lib/credit-packs";

export default function PricingCard({
  pack,
  onBuy,
}: {
  pack: CreditPack;
  onBuy: (pack: CreditPack) => void;
}) {
  const features = [
    `${pack.credits.toLocaleString("pt-BR")} créditos Lovable`,
    "Acesso imediato após o pagamento",
    "Sem assinatura mensal",
    "Suporte via WhatsApp",
    `${pricePerCredit(pack)} por crédito`,
  ];

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-card/60 backdrop-blur p-6 transition-all",
        "border-primary/30 hover:border-primary/70 hover:shadow-[0_0_30px_hsl(120_100%_45%/0.25)]",
        pack.is_popular && "border-primary shadow-[0_0_40px_hsl(120_100%_45%/0.35)] scale-[1.02]"
      )}
    >
      {pack.is_popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
          Mais popular
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-5 h-5 text-primary" />
        <h3 className="text-xl font-bold uppercase tracking-wider">{pack.name}</h3>
      </div>

      <div className="mb-4">
        <div className="text-4xl font-black text-primary">
          {formatBRL(pack.price_cents)}
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {pack.credits.toLocaleString("pt-BR")} créditos
        </div>
      </div>

      <ul className="space-y-2 mb-6 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span className="text-foreground/90">{f}</span>
          </li>
        ))}
      </ul>

      <Button
        onClick={() => onBuy(pack)}
        className="w-full font-bold uppercase tracking-wider"
        size="lg"
      >
        Comprar agora
      </Button>
    </div>
  );
}