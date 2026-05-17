# Tratar "Too many requests…" do Stripe como limite diário (200 cr)

## Objetivo

Quando o worker detectar na página Stripe (downgrade LITE ou upgrade Pro US$5) a mensagem `Too many requests are being made. Please try again later.`, o painel deve interpretar como **limite diário do workspace atingido** — equivalente a 200 créditos farmados — e nunca como falha crítica nem disparar retries.

## 1. Edge Function `partner-shop-multi-workspace-tick`

Adicionar uma nova ação no schema Zod, `action: "limit_reached"`:

```
{
  action: "limit_reached",
  orderId, fingerprint,
  workspace: string,
  reason?: string  // default "stripe_daily_farm_limit_reached"
}
```

Comportamento:

- Localizar o item por nome bruto → `cleanWorkspaceName` → `normalizeWorkspaceKey` (helper já existe).
- Marcar `plan[idx].status = "done"`, `plan[idx].farmed = 200`, `finished_at = now`, `error = null`.
- Promover o próximo `pending` para `running` (mesma lógica do `next`). Se não houver, finalizar o pedido:
  - `doneCount > 0 → "delivered"`, calcular `credits = sum(farmed dos done)` e `amount_cents = doneCount * price_cents_per_workspace`.
  - Chamar `refund_order_remainder` com `_reason = "stripe_daily_farm_limit_reached"` para devolver o que sobrar.
  - Liberar o bot (`status=idle`, `current_order_id=null`) e chamar `assign_next_queued_order`.
- Logar em `payment_events` com `event_type = "workspace_limit_reached"` e `metadata = { workspace, reason: "stripe_daily_farm_limit_reached" }`.

Para **pedido de workspace único** (`multi_workspace_mode = false`) o worker não usa o tick. Vamos adicionar um endpoint paralelo nesta mesma função: aceitar `action: "limit_reached"` também sem `workspaces_plan` — quando `order.multi_workspace_mode = false`, marcar o pedido direto como `delivered` com `credits = 200`, `amount_cents = price já cobrado`, `delivered_at = now`, `failed_reason = null`, liberar bot, registrar evento.

## 2. RPC auxiliar — opcional reuso

A RPC `skip_current_workspace(_order_id, _reason)` já aceita `'already_at_limit'` e faz exatamente o necessário em multi-ws (marca done com farmed=200 e avança). Vou:

- Adicionar `'stripe_daily_farm_limit_reached'` como reason aceita (mesmo comportamento de `already_at_limit`, mas com `failed_reason` distinto no log).
- A nova action `limit_reached` da edge function delega para essa RPC quando o pedido é multi-ws — mantendo uma única fonte de verdade. Para single-ws, a edge function trata inline (não há plano).

## 3. `execucoes_lovable`

Adicionar registro com `status = 'limite'`, `erro = 'stripe_daily_farm_limit_reached'`, `creditos_adicionados = 200`, `creditos_finais = creditos_iniciais + 200`, `finalizado_em = now`. Inserção feita dentro da edge function via service role.

## 4. UI — `Pedidos.tsx`

- Quando `workspaces_plan[].status === 'done'` E o item tem marker de limite (campo `error` começa com `stripe_daily_farm_limit_reached` ou nova flag `limited: true` no item), exibir badge cinza-azul **"limite diário"** ao lado do nome (em vez de check verde puro).
- Modal/Detalhe: se `failed_reason === 'stripe_daily_farm_limit_reached'` em pedido `delivered`, mostrar banner azul informativo *"Limite diário do workspace atingido — 200 cr contabilizados"* em vez de qualquer aviso vermelho.
- Não tratar como falha crítica em nenhuma view (linha da tabela, badge, contadores).

Para sinalizar o item: adicionar `limited?: boolean` ao item de `workspaces_plan` quando a função `limit_reached` rodar (apenas campo informativo, não muda o status `done`).

## 5. Logs / eventos

- `payment_events.event_type = "workspace_limit_reached"` (multi-ws) ou `"order_limit_reached"` (single-ws).
- `metadata` inclui `{ reason: "stripe_daily_farm_limit_reached", workspace, finalStatus }`.
- Worker continua sendo a fonte: ele detecta a string exata e chama `action: "limit_reached"` em vez de `fail`.

## 6. Status enums — sem mudanças de schema

Compatíveis com o que já existe:
- `partner_credit_orders.status`: processing → delivered (ou refunded se 0 done em multi-ws, já tratado em pedido anterior).
- `execucoes_lovable.status`: já tem `'limite'`.
- `workspaces_plan[].status`: `done` (limite contabiliza como done).

## 7. Segurança

Nenhum secret novo. Worker manda fingerprint igual ao das outras actions. Service role só na edge. Frontend continua sem ver senha/cartão/secret.

## Fora de escopo

- Não vou mexer no worker desktop (Python). O contrato é só a nova `action: "limit_reached"` da edge — o worker é atualizado em release separada.
- Não vou alterar o fluxo de Stripe nem fazer scraping da página no servidor — a detecção é responsabilidade do worker.
- Não vou mexer em `refund_order_remainder` (já está OK para `done_count>0 → delivered`).

## Arquivos previstos

Editados:
- `supabase/functions/partner-shop-multi-workspace-tick/index.ts` — nova action.
- `supabase/migrations/<novo>.sql` — pequena atualização em `skip_current_workspace` para aceitar reason `'stripe_daily_farm_limit_reached'` com mesmo efeito de `'already_at_limit'`, e gravar `failed_reason` específico.
- `src/pages/dashboard/Pedidos.tsx` — badge "limite diário" em workspace e banner azul no modal.
- (opcional) `src/integrations/supabase/types.ts` regenerado pelo migration.

Sem novos secrets, sem mudanças em RLS, sem mudanças no schema base (apenas update de função).
