## Objetivo

Hoje, quando o worker quebra (ex.: `WinError 1225`, falha de login, conexão recusada), o pedido vai para `failed` e o cliente perde os créditos pagos. Também não há como o cliente parar o farm no meio do caminho — se quiser cancelar, perde tudo. Vamos:

1. Converter qualquer falha (parcial ou total) em **saldo de crédito do cliente** equivalente ao que faltou farmar.
2. Permitir que o cliente **pare o farm** quando quiser; o que já foi farmado fica entregue, o restante volta como saldo.
3. Permitir que o cliente **gaste esse saldo** num novo pedido, pagando via Pix só a diferença (ou nada, se o saldo cobrir).

Saldo é por par (`partner_id` + `customer_email`/`fingerprint`), não depende de login do cliente.

## Mudanças no banco

### Nova tabela `partner_customer_balances`
Campos principais:
- `partner_id uuid not null`
- `customer_email text not null` (lower)
- `client_fingerprint text` (opcional, para localizar quando email não casar)
- `credits int not null default 0` (saldo disponível em créditos Lovable, não em centavos)
- `updated_at`, `created_at`
- Unique `(partner_id, customer_email)`

RLS: `pco_admin_all` equivalente; parceiro lê o seu (`partner_id = auth.uid()`); insert/update apenas via service role (edge functions).

### Nova tabela `partner_credit_ledger` (auditoria)
- `id`, `partner_id`, `customer_email`, `order_id`
- `delta int` (positivo = crédito, negativo = consumo)
- `reason text` (`refund_failure`, `refund_stop`, `applied_to_order`, `manual_adjust`)
- `created_at`

Permite reconstruir o saldo e dar transparência no histórico.

### Funções SQL (security definer)
- `refund_order_remainder(_order_id uuid, _reason text)`:
  - Lê o pedido, calcula `farmed = SUM(creditos_adicionados)` em `execucoes_lovable` (mesma lógica das edge functions).
  - `remainder = order.credits - farmed` (clamp ≥ 0).
  - Se `remainder > 0`, faz `INSERT ... ON CONFLICT` em `partner_customer_balances` somando `remainder`, grava no ledger.
  - Atualiza `partner_credit_orders.status = 'refunded'`, `failed_reason = _reason`, `delivered_at = now()` se o que foi farmado também conta como entrega parcial.
  - Libera o bot via `release_bot(...)` se ainda estiver atribuído.

- `stop_order_partial(_order_id uuid, _fingerprint text)`:
  - Valida fingerprint igual ao do pedido.
  - Só aceita status `paid|queued|processing`.
  - Marca um flag `stop_requested_at` na ordem (nova coluna), e chama `refund_order_remainder` imediatamente com `reason = 'stopped_by_customer'`.
  - O worker, ao bater o próximo heartbeat, vê o status já `refunded` e encerra o ciclo.

- `apply_balance_to_order(_partner_id, _customer_email, _amount int)`:
  - Decrementa saldo de forma atômica (`UPDATE ... WHERE credits >= _amount RETURNING credits`).
  - Grava no ledger com `delta = -_amount`, `reason = 'applied_to_order'`.

### Coluna nova em `partner_credit_orders`
- `stop_requested_at timestamptz`
- `balance_applied_cents int default 0` e `balance_applied_credits int default 0` (o que veio de saldo, para mostrar no recibo)

## Edge functions

### Nova `partner-shop-stop-order`
Body: `{ orderId, fingerprint }`.
- Valida fingerprint.
- Chama `stop_order_partial`.
- Retorna `{ ok, refundedCredits, farmedCredits }`.

### Atualizar `partner-shop-create-pix`
- Aceitar opcional `useBalance: boolean` (default true).
- Antes de criar Pix:
  - Buscar saldo em `partner_customer_balances` por `partner_id + customer_email`.
  - Se saldo cobre 100% dos créditos pedidos: cria pedido já com `status='paid'`, `paid_at=now()`, `balance_applied_credits=credits`, `amount_cents=0`, chama `assign_bot_to_order` e pula gateway.
  - Se cobre parcial: gera Pix só sobre a diferença (`credits_a_pagar = credits - saldo_aplicado`), grava `balance_applied_credits = saldo_aplicado`. **Ainda assim só consome o saldo após o pagamento confirmado** — gravar a intenção em `balance_applied_credits`, e mover o débito real do saldo no webhook (`abacatepay-webhook` / no transition `pending → paid`).
- Para evitar corrida, na transição para `paid`, chamar `apply_balance_to_order` usando `balance_applied_credits` da ordem; se falhar (saldo sumiu), zerar `balance_applied_credits` e prosseguir normalmente — o cliente recebe o que pagou no Pix.

### Atualizar `abacatepay-webhook` (e o sync em `partner-shop-check-status`)
- No momento que muda para `paid`, executar `apply_balance_to_order` se `balance_applied_credits > 0`.

### Atualizar worker hook (via DB) — sem mexer no Python
- Adicionar gatilho ou simplesmente expor: quando worker chama `release_bot(_success=false, _reason=...)`, chamar `refund_order_remainder` automaticamente dentro do mesmo RPC. Assim qualquer falha vira saldo sem precisar atualizar o Codex/worker. (O worker já chama `release_bot` em falhas críticas; se não chamar, ainda existe a rota manual por timeout — abaixo.)

  Implementação: alterar `release_bot` para, quando `_success=false`, em vez de só marcar `failed`, chamar internamente `refund_order_remainder(_order_id, _reason)`. Se o remainder for 0 (já farmou tudo), trata como `delivered`.

### Atualizar `partner-shop-list-orders` e `partner-shop-check-status`
- Incluir no payload:
  - `customerBalance: { credits: number }` por par parceiro+email do device.
  - Por pedido: `stopRequestedAt`, `balanceAppliedCredits`, `refundedCredits` (= `credits - farmed` quando `status='refunded'`).

## Frontend `src/pages/ComprarParceiro.tsx`

### Saldo do cliente (header / topo do histórico)
- Card pequeno mostrando "Saldo disponível: X créditos" quando `customerBalance.credits > 0`, com tooltip explicando origem (falhas/cancelamentos anteriores).

### Botão "Parar farm"
- Em `OrderTrackingInline`, para status `processing|queued|paid` com bot atribuído:
  - Botão `destructive` "Parar farm e receber saldo".
  - `AlertDialog` confirmando: "Você já farmou X de Y créditos. Os Z restantes voltam como saldo para usar em outro pedido sem pagar de novo."
  - Chama `partner-shop-stop-order`.
  - Após sucesso, refetch lista + status.

### Card de pedido `refunded`
- Em `OrdersHistorySection`, quando `status='refunded'`:
  - Badge "Reembolsado em saldo".
  - Linha "Você farmou X de Y. Z créditos voltaram como saldo."
  - Botão "Usar saldo em novo pedido" → abre o checkout pré-preenchido.

### Checkout (`CheckoutCreditsDialog` ou inline na página)
- Se houver `customerBalance.credits > 0`, mostrar checkbox "Usar X créditos do meu saldo" (default ligado).
- Recalcular `amountCents` localmente para mostrar "Você paga apenas R$ Y via Pix" ou "Saldo cobre o pedido — sem cobrança".
- Enviar `useBalance` no body do `partner-shop-create-pix`.

### Tipos
- Estender `OrderItem` com `stopRequestedAt`, `balanceAppliedCredits`, `refundedCredits`.
- Novo tipo `CustomerBalance { credits: number }`.

## Detalhes técnicos importantes

- **Atomicidade do saldo**: todas as mutações via funções SQL `SECURITY DEFINER` com `UPDATE ... WHERE credits >= X RETURNING` para evitar saldo negativo.
- **Nada novo no worker Python**: a hook entra via `release_bot`, que ele já chama. Falhas que não chegam a chamar `release_bot` (worker travou) precisam de um job de varredura — fora do escopo desta entrega; documentar como follow-up.
- **Idempotência**: `refund_order_remainder` checa se a ordem já está em estado terminal (`delivered|refunded|expired`); se sim, não credita de novo.
- **Privacidade**: saldo é exposto apenas para o par `partner_id + (fingerprint OR customer_email)` que o device já usa para listar pedidos — mesma regra atual.
- **Sem mudanças**: schema de `execucoes_lovable`, fluxo de fingerprint, RLS já existente em outras tabelas, layout do tracking inline (só ganha botão e linha).

## Ordem de execução

1. Migration: tabela `partner_customer_balances`, `partner_credit_ledger`, novas colunas em `partner_credit_orders`, funções SQL, alteração de `release_bot`.
2. Edge function nova `partner-shop-stop-order`.
3. Atualizar `partner-shop-create-pix` (aplicar saldo) e `abacatepay-webhook` (debitar saldo no paid).
4. Atualizar `partner-shop-list-orders` e `partner-shop-check-status` (expor saldo e novos campos).
5. Frontend: card de saldo, botão parar, card refunded, checkbox usar saldo no checkout.
6. QA: simular falha → ver saldo creditado → criar novo pedido usando saldo (sem Pix ou Pix parcial).
