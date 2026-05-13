## Objetivo

Permitir "Repetir diariamente" para **todos os tipos de pedido manual**:
- (a) Single-workspace (workspace alvo + créditos + valor fixo por execução)
- (b) Bot "Automático" (escolhe um bot livre na hora do tick), tanto para single-ws quanto multi-ws

Hoje a programação só funciona para multi-ws com bot específico. Vamos remover essa cascata e ensinar o backend a criar pedidos do tipo correto a cada tick.

## Mudanças

### 1. Banco — `partner_order_schedules` (migration)

Adicionar colunas para suportar os dois modos novos:

```sql
alter table public.partner_order_schedules
  add column if not exists multi_workspace_mode boolean not null default true,
  add column if not exists target_workspace text,
  add column if not exists credits_per_run integer,
  add column if not exists amount_cents_per_run integer,
  alter column bot_id drop not null;       -- permitir auto
```

Regras (validadas via trigger):
- `multi_workspace_mode = true` → exige `price_cents_per_workspace`, ignora `target_workspace`/`credits_per_run`/`amount_cents_per_run`.
- `multi_workspace_mode = false` → exige `target_workspace`, `credits_per_run`, `amount_cents_per_run`.
- `bot_id` pode ser `NULL` (modo automático).

Pedidos legados ficam com `multi_workspace_mode = true` (default), preservando o comportamento atual.

### 2. Edge function `partner-shop-create-order-schedule`

Aceitar 3 formatos no body:

```ts
// multi-ws (existente)
{ mode: "multi", botId?, pricePerWorkspaceCents, ... }
// single-ws (novo)
{ mode: "single", botId?, targetWorkspace, credits, amountCents, ... }
```

- `botId` agora opcional em ambos (omitir = automático).
- Validar com `zod` discriminated union.
- Persistir `multi_workspace_mode`, `bot_id` (nullable), `target_workspace`, `credits_per_run`, `amount_cents_per_run`.

### 3. Edge function `partner-shop-schedule-tick`

No `processSchedule`, ramificar pelo `multi_workspace_mode`:

- **Multi-ws** (atual): mantém exatamente o que faz hoje.
- **Single-ws** (novo): cria `partner_credit_orders` com `multi_workspace_mode=false`, `target_workspace`, `credits = credits_per_run`, `amount_cents = amount_cents_per_run`, `is_manual=true`.

Atribuição de bot:
- Se `bot_id` da programação é `NULL` → chamar `assign_bot_to_order(orderId)` (mesmo helper já usado no fluxo manual). Ele acha um bot livre do parceiro ou marca `queued`.
- Se `bot_id` definido → manter lógica atual (claim atômico do bot específico, ou `queued`).

### 4. Frontend `ManualOrderDialog.tsx`

Remover as travas:

- Apagar o efeito que desliga `recurring` quando `multiWs` é off (linha 111-113).
- Apagar o efeito que desliga `multiWs` quando `botId === "auto"` (linha 106-108) **OU** mantê-lo só como aviso, não como trava.
- Mover o switch "Repetir diariamente" para **fora** do bloco `{multiWs && ...}`, sempre visível.
- Permitir bot "Automático" tanto em multi quanto single.

Schema de submit:
- Recurring + multi → `{ mode: "multi", botId: botId === "auto" ? null : botId, pricePerWorkspaceCents, endMode, ... }`
- Recurring + single → `{ mode: "single", botId: botId === "auto" ? null : botId, targetWorkspace, credits, amountCents, endMode, ... }`

Texto explicativo do switch ajustado para refletir que também roda em single-workspace e com bot automático.

### 5. Frontend `Programacoes.tsx`

A tabela hoje assume multi-ws. Adicionar:
- Coluna/badge "Tipo": `Multi-WS` ou `Single-WS (workspace X)`.
- Coluna "Bot": nome do bot ou "Automático".
- Texto de "Execuções" inalterado.

Tipo `Schedule` ganha `multi_workspace_mode`, `target_workspace`, `credits_per_run`, `amount_cents_per_run`, e `bot_id: string | null`.

## Detalhes técnicos

- Nenhuma mudança no worker desktop — ele já lida com pedidos single e multi vindos da fila normal.
- `partner-shop-cancel-order-schedule` não muda.
- Watchdog/`refund_order_remainder` não mudam — pedidos gerados pelo tick seguem o fluxo padrão de cada tipo.
- Backfill: pedidos gerados antes da migration ficam com `multi_workspace_mode=true` (default), igual ao comportamento atual.
- Quota do parceiro: o `partner-shop-create-manual-order` já valida limite — vamos replicar a mesma checagem dentro do `schedule-tick` antes de inserir o pedido (se faltar quota, marca `runs_failed++` e não cria).

## Fora de escopo

- Não mexer em pedidos não-manuais (PIX) — programação continua sendo só para fluxo manual.
- Não alterar semântica do retry/stop existentes.
