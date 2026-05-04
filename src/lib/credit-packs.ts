export type CreditPack = {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  is_popular: boolean;
  is_active: boolean;
  display_order: number;
  badge_label?: string | null;
};

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function pricePerCredit(pack: CreditPack): string {
  const v = pack.price_cents / pack.credits / 100;
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}