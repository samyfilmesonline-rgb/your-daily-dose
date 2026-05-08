## Causa do erro atual

A edge function `partner-shop-create-manual-order` usa `callerClient.auth.getClaims(token)`, que **não existe** no `@supabase/supabase-js@2.45.0`. Por isso responde 500 → "Edge Function returned a non-2xx status code".

**Fix:** trocar para `callerClient.auth.getUser(token)` (mesmo padrão das outras edges do projeto).

## Modelo de débito/estorno (justo)

- Hoje, em pedidos pagos via PIX, o `refund_order_remainder` calcula `farmed = SUM(execucoes_lovable.creditos_adicionados)` no bot/workspace desde `assigned_at`, e devolve `remainder = credits - farmed` como **saldo do cliente**.
- Para **recargas manuais** isso está errado: o custo é do parceiro (cortesia), então débito e estorno têm que mexer em `parceiros.creditos_consumidos`, **não** em `partner_customer_balances`.
- A regra "se pediu 200 e farmou 100, estorna 100" já existe no cálculo de `remainder` — basta direcioná-lo ao parceiro quando o pedido for manual.

## Mudanças

### 1) Migração SQL

- Adicionar coluna `is_manual boolean NOT NULL DEFAULT false` em `partner_credit_orders` (e backfill `true` para `tx_id LIKE 'manual:%'`).
- Nova função `debit_partner_quota(_partner_id uuid, _amount int, _order_id uuid, _reason text) RETURNS void`:
  - `UPDATE parceiros SET creditos_consumidos = creditos_consumidos + _amount` com guard `creditos_consumidos + _amount <= limite_creditos`; se estourar, RAISE.
  - Insere ledger `delta = -_amount`, `reason = 'manual_debit:...'`.
- Nova função `refund_partner_quota(_partner_id uuid, _amount int, _order_id uuid, _reason text)`:
  - `UPDATE parceiros SET creditos_consumidos = GREATEST(creditos_consumidos - _amount, 0)`.
  - Insere ledger `delta = +_amount`, `reason = 'manual_refund:...'`.
- Atualizar `refund_order_remainder`: se `v_order.is_manual = true`, em vez de creditar `partner_customer_balances`, chamar `refund_partner_quota(partner_id, v_remainder, ...)`. Mantém status `delivered`/`refunded` e libera o bot exatamente como hoje.
- Como `release_bot` já chama `refund_order_remainder` quando o worker reporta falha, e `stop_order_partial` também → cobre falha do bot, parada manual e cancelamento. Sem outras mudanças nessas funções.
- Nova função `cancel_manual_order(_order_id uuid, _reason text)` (SECURITY DEFINER): valida pedido manual em `paid|queued|processing`, marca `stop_requested_at = now()`, chama `refund_order_remainder('canceled_manual')`. Será usada pelo botão de cancelar manual (admin/parceiro dono).

### 2) Edge function `partner-shop-create-manual-order`

- Trocar `getClaims` → `getUser(token)`.
- **Antes** de inserir o pedido, validar quota: ler `parceiros (limite_creditos, creditos_consumidos, status='ativo')` do `partnerId`. Se `creditos_consumidos + credits > limite_creditos` → 400 com mensagem clara.
- Inserir pedido com `is_manual = true`.
- Chamar `debit_partner_quota(partnerId, credits, orderId, 'manual_order:<notes>')` imediatamente após criar o pedido (substitui o ledger atual de `delta=0`).
- Se a atribuição do bot falhar (claim race) e o pedido for para `queued`, **manter o débito** (será estornado se cancelar/falhar; consumido se farmar).

### 3) Edge function `partner-shop-cancel-manual-order` (nova)

- Auth: parceiro dono ou admin.
- Body: `{ orderId }`. Valida `is_manual = true`. Chama `cancel_manual_order(orderId,'canceled_by_user')`.
- Retorna `{ ok, refundedCredits }`.

### 4) Frontend

- `ManualOrderDialog`: tratar erro 400 de quota com toast claro ("Limite de créditos do parceiro insuficiente").
- `Pedidos.tsx`: para linhas onde `is_manual = true` e status `paid|queued|processing`, mostrar botão **"Cancelar"** (admin ou parceiro dono) que chama a nova edge. Em sucesso, toast "Estornados X créditos" + invalidate.
- Exibir badge "Manual" na linha do pedido para identificação.

## Fora de escopo

- Mudar contabilidade dos pedidos PIX existentes (continuam creditando saldo do cliente).
- Nova UI de auditoria de quota do parceiro (já visível em `parceiros.creditos_consumidos`).
