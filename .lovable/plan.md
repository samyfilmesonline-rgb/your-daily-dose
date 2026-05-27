## Objetivo

Atualizar o gerenciador (Pedidos + Workspaces) para refletir o worker corrigido: estados claros, eventos em tempo real, ações manuais seguras e indicador de saúde do worker. Sem expor segredos.

## 1. Backend — nova tabela `worker_events`

Migração criando `public.worker_events`:

- `order_id uuid` (nullable — eventos de worker idle não têm pedido)
- `bot_id uuid`
- `partner_id uuid`
- `event_type text` (enum por CHECK: `billing_plan_checked`, `workspace_selected`, `captcha_required`, `credits_farmed`, `order_finished`, `billing_upgrade_attempted`, `billing_downgrade_corrected`)
- `severity text` (`info` | `warn` | `action_required`)
- `message text` curto e seguro
- `payload jsonb` (sanitizado — o worker NÃO envia card/token/links Stripe; validação adicional no edge function de ingest)
- `created_at timestamptz default now()`

Índices: `(order_id, created_at desc)`, `(partner_id, created_at desc)`, `(event_type) where severity='action_required'`.

GRANTs + RLS:
- `GRANT SELECT ON worker_events TO authenticated; GRANT ALL TO service_role`.
- Policy `select`: admin OR `partner_id = auth.uid()`.
- Sem INSERT por authenticated — apenas service_role (worker via edge function).
- Realtime habilitado para o cliente assinar `INSERT` filtrado por `partner_id`/`order_id`.

Edge function `worker-ingest-event` (service_role): valida shape, regex-strip de campos sensíveis (`card`, `cvc`, `service_role`, `sk_live`, `pk_live`, `stripe.com/...`) antes de persistir. Worker passa a chamar esta função em vez de inserir direto.

## 2. Frontend — Pedidos.tsx

### 2.1 Mapa de estados unificado

Helper `orderStateMeta(status)` retornando label PT-BR, cor (token semântico) e ícone para: `pending`, `processing`, `waiting_workspace`, `waiting_invite`, `delivered`, `failed`, `refunded`. `paid`/`queued`/`expired` continuam tratados mas com label coerente. Substitui badges ad-hoc espalhadas.

### 2.2 Timeline de eventos do worker (tempo real)

No dialog de detalhes do pedido:

- Subscrever `supabase.channel('worker_events:'+orderId)` em `postgres_changes` INSERT.
- Listar últimos eventos com ícone por `event_type`:
  - `billing_plan_checked` → ✓ informativo
  - `workspace_selected` → mostra nome do workspace
  - `captcha_required` → banner amarelo no topo do dialog + toast persistente "Ação manual necessária: resolver captcha no worker"
  - `credits_farmed` → contador incremental
  - `order_finished` → fecha timeline
  - `billing_downgrade_corrected` / `billing_upgrade_attempted` → badge "Primeira assinatura PRO: worker corrigiu downgrade falso" quando aplicável

### 2.3 Reenfileirar manual

Para pedidos `failed`/`refunded` com `failed_reason` indicando erro de checkout/cartão (`card_declined`, `checkout_failed`, `stripe_error`, `billing_*_failed`):

- Exibir motivo resumido (mapa de razões técnicas → texto PT-BR amigável, ex. "Cartão recusado pelo provedor").
- Botão "Reenfileirar pedido" que chama edge function existente `partner-shop-retry-manual-order` (que invoca `retry_manual_order` no DB — re-debita e reatribui bot, não duplica).
- Confirmação no dialog antes de chamar; toast com novo status retornado.

### 2.4 Sanitização defensiva no render

Filtro em `raw_payload`/`failed_reason` que esconde qualquer string que case com: PAN (`\b\d{13,19}\b`), `cvc`, `sk_live_`, `pk_live_`, `service_role`, `eyJ` (JWT), URLs `stripe.com/(checkout|c)/...`. Substitui por `••••`. Aplica ao timeline e ao painel de debug.

## 3. Indicador de saúde do worker

Componente `WorkerHealthBadge` no header de Pedidos e Workspaces:

- Lê `farm_bots` do parceiro (já existe), agregando:
  - `online`: algum bot com `last_heartbeat_at > now()-60s`
  - `processing`: algum `status='busy'`
  - `idle`: todos heartbeat ok mas nenhum busy
  - `parado`: nenhum heartbeat < 5min → vermelho com tooltip "Worker offline há Xmin"
- Atualiza via realtime em `farm_bots` (filtro `partner_id=eq.<uid>`) + fallback poll 30s.

## 4. Detalhes técnicos

- Sem mudanças em business logic do worker — apenas consumo dos eventos que ele já vai emitir.
- Realtime: garantir `ALTER PUBLICATION supabase_realtime ADD TABLE worker_events` na migração.
- Mapa de `failed_reason` → texto amigável fica em `src/lib/order-reasons.ts` (testável).
- Mapa de `event_type` → ícone/label em `src/lib/worker-events.ts`.
- Componente `OrderEventTimeline` novo em `src/components/dashboard/pedidos/`.
- Sem alteração em rotas/permissions.

## 5. Fora de escopo

- Implementação do worker em si (já corrigido por você).
- Captura/resolução automática de captcha.
- Cobrança/Stripe — apenas display sanitizado.
