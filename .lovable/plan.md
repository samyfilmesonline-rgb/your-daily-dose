# Corrigir erro ao gerar Pix de R$ 0,30 (saldo cobrindo quase tudo)

## Diagnóstico

Logs da edge function `partner-shop-create-pix` mostram erro 422 da AbacatePay:

```
amount: 30  // R$ 0,30
error: "Value should be one of 'object', 'object'"
```

A AbacatePay rejeita cobranças Pix abaixo do **mínimo de R$ 1,00 (100 centavos)**. O cliente tem 140 créditos de saldo e o pacote de 200 créditos custa R$ 1,00, então o cálculo proporcional gerava R$ 0,30 — abaixo do mínimo.

A mensagem confusa "Value should be one of 'object', 'object'" é um bug do schema da Abacate, mas a causa real é o valor mínimo.

## Solução

Quando o saldo deixaria o Pix abaixo de R$ 1,00, **limitar o uso de saldo** para que o Pix fique exatamente em R$ 1,00 (ou cobrir 100% e pular o Pix). Cliente nunca paga menos que R$ 1,00 via Pix — o resto fica como saldo para próxima compra.

### Backend — `supabase/functions/partner-shop-create-pix/index.ts`

Após calcular `balanceToApply` e `amountToCharge`, aplicar:

```ts
const MIN_PIX_CENTS = 100;
if (amountToCharge > 0 && amountToCharge < MIN_PIX_CENTS) {
  // Reduz o saldo aplicado para manter o Pix no mínimo de R$ 1,00
  const maxBalanceCents = pack.price_cents - MIN_PIX_CENTS;
  const newBalanceCredits = Math.max(0, Math.floor(maxBalanceCents / pricePerCredit));
  balanceToApply = Math.min(balanceToApply, newBalanceCredits);
  creditsToCharge = pack.credits - balanceToApply;
  amountToCharge = Math.round(pricePerCredit * creditsToCharge);
  balanceCentsValue = pack.price_cents - amountToCharge;
}
```

(transformar `const` em `let` nas variáveis afetadas).

### Frontend — `src/pages/ComprarParceiro.tsx`

Aplicar a mesma regra em `computePriceWithBalance` para mostrar o valor correto antes de gerar o Pix:

```ts
function computePriceWithBalance(packCredits, packPriceCents, balanceCredits) {
  const MIN_PIX_CENTS = 100;
  let balanceUsed = Math.max(0, Math.min(balanceCredits, packCredits));
  let remaining = packCredits - balanceUsed;
  let payCents = packCredits > 0
    ? Math.round((packPriceCents * remaining) / packCredits)
    : packPriceCents;

  // Mínimo de R$ 1,00 quando há Pix
  if (payCents > 0 && payCents < MIN_PIX_CENTS) {
    const pricePerCredit = packPriceCents / packCredits;
    const maxBalanceCents = packPriceCents - MIN_PIX_CENTS;
    balanceUsed = Math.max(0, Math.floor(maxBalanceCents / pricePerCredit));
    remaining = packCredits - balanceUsed;
    payCents = Math.round(pricePerCredit * remaining);
  }

  return { balanceUsed, payCents, freeWithBalance: payCents === 0 && balanceUsed > 0 };
}
```

Adicionar nota visual no card/dialog quando o saldo foi limitado: "Pix mínimo R$ 1,00 — restante (X cr) fica no seu saldo".

## Arquivos alterados

- `supabase/functions/partner-shop-create-pix/index.ts`
- `src/pages/ComprarParceiro.tsx`

Sem mudanças em DB, RLS ou outros componentes.
