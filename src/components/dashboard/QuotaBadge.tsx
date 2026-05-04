import { useAuth } from "@/hooks/useAuth";
import { Coins } from "lucide-react";

export default function QuotaBadge() {
  const { parceiro, isAdmin } = useAuth();
  if (isAdmin || !parceiro) return null;
  const used = Number(parceiro.creditos_consumidos) || 0;
  const max = Number(parceiro.limite_creditos) || 0;
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const color =
    pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="hidden sm:flex items-center gap-2 text-xs">
      <Coins className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-mono text-muted-foreground">
        {used.toLocaleString("pt-BR")} / {max.toLocaleString("pt-BR")}
      </span>
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}