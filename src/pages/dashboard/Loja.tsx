import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins, ShoppingBag, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CreditPack, formatBRL } from "@/lib/credit-packs";
import PricingCard from "@/components/landing/PricingCard";
import GlitchText from "@/components/landing/GlitchText";
import CheckoutCreditsDialog from "@/components/dashboard/loja/CheckoutCreditsDialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type PixChargeRow = {
  id: string;
  pack_id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  paid_at: string | null;
};

export default function Loja() {
  const { parceiro, refreshParceiro, user } = useAuth();
  const { toast } = useToast();
  const [selectedPack, setSelectedPack] = useState<CreditPack | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.title = "Loja de Créditos · Matrix Admin";
  }, []);

  const { data: packs, isLoading } = useQuery({
    queryKey: ["credit-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_packs")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as CreditPack[];
    },
  });

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ["my-pix-charges", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pix_charges")
        .select("id, pack_id, amount_cents, status, created_at, paid_at")
        .eq("partner_user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as PixChargeRow[];
    },
  });

  const used = Number(parceiro?.creditos_consumidos ?? 0);
  const max = Number(parceiro?.limite_creditos ?? 0);
  const remaining = Math.max(0, max - used);
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;

  const handleBuy = (p: CreditPack) => {
    setSelectedPack(p);
    setOpen(true);
  };

  const handlePaid = async (creditsAdded: number) => {
    await refreshParceiro();
    await refetchHistory();
    toast({
      title: "Créditos adicionados!",
      description: `+${creditsAdded.toLocaleString("pt-BR")} créditos no seu farm.`,
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-primary/70">
          <ShoppingBag className="w-3.5 h-3.5" /> Console / Loja
        </div>
        <h1 className="text-3xl sm:text-4xl font-black font-mono">
          <GlitchText>LOJA DE CRÉDITOS</GlitchText>
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Compre pacotes de créditos via Pix com liberação automática. Ao pagar, o
          limite do seu farm é aumentado imediatamente.
        </p>
      </div>

      {/* Saldo atual */}
      {parceiro && (
        <div className="rounded-2xl border-2 border-primary/30 bg-card/60 backdrop-blur p-6 shadow-[0_0_30px_hsl(var(--primary)/0.15)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary/70 mb-1">
                Saldo de farm
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black font-mono text-primary">
                  {remaining.toLocaleString("pt-BR")}
                </span>
                <span className="text-sm font-mono text-muted-foreground">
                  / {max.toLocaleString("pt-BR")} créditos disponíveis
                </span>
              </div>
              <div className="text-xs font-mono text-muted-foreground mt-1">
                Já consumidos: {used.toLocaleString("pt-BR")}
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-primary/40 bg-primary/10">
              <Coins className="w-4 h-4 text-primary" />
              <span className="text-xs font-mono uppercase tracking-wider text-primary">
                {parceiro.status}
              </span>
            </div>
          </div>
          <div className="mt-4 h-2 bg-muted/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all shadow-[0_0_12px_hsl(var(--primary)/0.6)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Pacotes */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-primary/80">
            Escolha seu pacote
          </h2>
        </div>
        {isLoading ? (
          <div className="text-center text-muted-foreground font-mono py-10">
            Carregando...
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {packs?.map((p) => (
              <PricingCard key={p.id} pack={p} onBuy={handleBuy} />
            ))}
          </div>
        )}
        <div className="flex items-center justify-center gap-2 mt-6 text-xs font-mono text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          Pagamento seguro via Pix · Liberação automática no seu farm
        </div>
      </section>

      {/* Histórico */}
      <section>
        <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-primary/80 mb-3">
          Suas compras
        </h2>
        <div className="rounded-xl border border-primary/20 bg-card/40 backdrop-blur overflow-hidden">
          {!history || history.length === 0 ? (
            <div className="p-6 text-center text-sm font-mono text-muted-foreground">
              Nenhuma compra ainda.
            </div>
          ) : (
            <div className="divide-y divide-primary/10">
              {history.map((h) => {
                const pack = packs?.find((p) => p.id === h.pack_id);
                const statusLabel =
                  h.status === "paid"
                    ? "Pago"
                    : h.status === "expired"
                    ? "Expirado"
                    : "Pendente";
                const statusColor =
                  h.status === "paid"
                    ? "text-primary"
                    : h.status === "expired"
                    ? "text-muted-foreground"
                    : "text-amber-400";
                return (
                  <div
                    key={h.id}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-primary/5 transition"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold truncate">
                        {pack?.name ?? h.pack_id}
                      </div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        {new Date(h.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold">
                        {formatBRL(h.amount_cents)}
                      </div>
                      <div
                        className={`text-[10px] font-mono uppercase tracking-wider ${statusColor}`}
                      >
                        {statusLabel}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <CheckoutCreditsDialog
        pack={selectedPack}
        open={open}
        onOpenChange={setOpen}
        onPaid={handlePaid}
      />
    </div>
  );
}