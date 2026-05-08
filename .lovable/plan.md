## Diagnóstico

O pedido manual `82b847c2…` foi atribuído ao bot e o worker desconectou (`failed_reason: "Server disconnected"`) **antes** de farmar 1 crédito. O `release_bot` chamou `refund_order_remainder`, que como `farmed=0` estornou os 200 créditos para a cota do parceiro e marcou status `refunded`. Sistema agiu como projetado, mas a UX é ruim: você não escolheu cancelar — quem desistiu foi o bot.

## Solução: botão "Tentar novamente" para pedidos manuais

Mantém o estorno automático atual (mais seguro — libera a cota) e adiciona um caminho explícito para o admin/parceiro reenfileirar.

### 1) Migração SQL

Nova função `retry_manual_order(_order_id uuid)` (SECURITY DEFINER):

- Valida: `is_manual = true`, status `refunded` ou `failed`, não tem `delivered_at`.
- Calcula `v_already_farmed` (mesma lógica de `refund_order_remainder`) — só por segurança, normalmente 0.
- Calcula `v_to_redebit = credits - already_farmed - balance_applied_credits`. Se ≤ 0, retorna erro.
- Re-valida quota: `creditos_consumidos + v_to_redebit ≤ limite_creditos`. Se estourar, RAISE.
- Chama `debit_partner_quota(partner_id, v_to_redebit, order_id, 'manual_retry')`.
- Reseta o pedido para nova tentativa:
  - `status = 'paid'`
  - `assigned_bot_id = NULL`, `assigned_at = NULL`
  - `failed_reason = NULL`, `stop_requested_at = NULL`
  - `refunded_credits = 0`
  - Atualiza `raw_payload` adicionando entrada em `manualOrder.retries[]` (timestamp, by, previous_failed_reason).
- Chama `assign_bot_to_order(order_id)` — vai para `processing` se houver bot livre, senão `queued`.
- Retorna `{ status, assignedBotId }`.

Permissões: `GRANT EXECUTE ... TO authenticated` (controle de acesso é feito na edge).

### 2) Edge function `partner-shop-retry-manual-order` (nova)

- Auth: token válido (`getUser`); buscar role admin via `has_role`.
- Body: `{ orderId }` (zod).
- Carrega o pedido; valida:
  - `is_manual = true`
  - Status em `('refunded','failed')`
  - Caller é admin OU `partner_id == callerId` (e parceiro ativo)
- Chama `retry_manual_order(orderId)`.
- Retorna `{ ok, status, assignedBotId }`.
- Tratamento de erro: 400 se quota insuficiente / pedido inválido, 500 outros.

### 3) Frontend `Pedidos.tsx`

- Para pedidos com `is_manual = true` e status em `refunded|failed`, mostrar botão **"Tentar novamente"** no diálogo de detalhes (admin ou dono).
- Estado `retryLoading` separado.
- Ao clicar:
  - `confirm` curto: "Re-debitar X créditos da cota e tentar farmar de novo?"
  - Invoca `partner-shop-retry-manual-order`.
  - Toast: "Reprocessando — bot iniciou agora" / "Sem bot livre, entrou na fila".
  - Invalida `my-orders` e `my-bots-mini`.
- Tratar erro de quota com mensagem clara.

### 4) Indicador visual

Pequeno badge "Tentativa #N" ao lado do badge "Manual" quando `raw_payload.manualOrder.retries.length > 0`. Lê do payload já carregado, sem nova query.

## Fora de escopo

- Mudar o comportamento automático em pedidos PIX (continua creditando saldo do cliente em falha).
- Retry automático sem ação humana (decidido manter manual).
- Limite de N tentativas (sem limite por enquanto; quota natural já protege).
