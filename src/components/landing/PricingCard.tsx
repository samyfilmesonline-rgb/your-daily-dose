import { Check, Zap, Users, AlertTriangle } from "lucide-react";
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
  const daysSingleAccount = Math.ceil(pack.credits / 200);
  const isResellerFriendly = pack.credits >= 1000;
  const badge = pack.badge_label ?? (pack.is_popular ? "Mais popular" : null);

  const features = [
    `${pack.credits.toLocaleString("pt-BR")} créditos Lovable`,
    `${pricePerCredit(pack)} por crédito`,
    "Liberação automática via Pix",
    "Use em várias contas Lovable",
    isResellerFriendly ? "Ideal para revenda" : "Sem assinatura mensal",
  ];

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-card/60 backdrop-blur p-6 transition-all",
        "border-primary/30 hover:border-primary/70 hover:shadow-[0_0_30px_hsl(120_100%_45%/0.25)]",
        pack.is_popular && "border-primary shadow-[0_0_40px_hsl(120_100%_45%/0.35)] scale-[1.02]"
      )}
    >
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
          {badge}
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

      <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <span className="text-foreground/90">
            Lovable libera no máximo <strong>200 créditos/conta a cada 24h</strong>.
          </span>
        </div>
        <div className="flex items-start gap-2">
          <Users className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <span className="text-muted-foreground">
            {daysSingleAccount === 1
              ? "Consome em 1 dia em uma única conta."
              : `~${daysSingleAccount} dias em 1 conta · 1 dia se dividir em ${daysSingleAccount} contas.`}
          </span>
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