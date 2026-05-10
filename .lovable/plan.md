## Programação recorrente de pedidos multi-workspace

Adicionar a possibilidade de transformar um pedido manual multi-workspace em uma **programação recorrente diária**: o mesmo conjunto de workspaces farma 200 créditos/dia automaticamente, no mesmo horário em que o pedido foi criado, durante X dias **ou** até uma data de término.

---

### 1. Banco de dados

Nova tabela **`partner_order_schedules`** (uma "programação-mãe" que dispara pedidos-filhos diariamente):

- `partner_id`, `bot_id`, `customer_*` (nome/email/whatsapp), `notes`
- `workspaces` (jsonb array de nomes), `price_cents_per_workspace`
- `start_at` (timestamptz — primeiro disparo, hora exata)
- `end_mode` (`days` | `until_date`), `total_days` (int) ou `end_at` (timestamptz)
- `daily_time` (time) — derivado de `start_at`, usado para próximos disparos
- `status` (`active` | `paused` | `completed` | `canceled`)
- `next_run_at`, `last_run_at`, `runs_completed` (int), `runs_failed` (int)
- `created_by`, timestamps

Nova coluna em **`partner_credit_orders`**:
- `schedule_id uuid` (nullable) — referência à programação-mãe
- `schedule_run_index int` (nullable) — qual dia da série este pedido representa

RLS: parceiro vê/edita só as próprias programações; admin vê tudo.

Nenhum débito antecipado: cada disparo diário cria um pedido novo, debita `200 × nº workspaces` na hora (igual fluxo atual em `partner-shop-multi-workspace-tick action=start`). Se a quota não cobrir, marca o run como `failed_no_quota` e segue tentando no dia seguinte.

### 2. Edge functions

**`partner-shop-create-order-schedule`** (nova)
- Recebe os mesmos campos do dialog atual de pedido manual + `endMode`, `totalDays` ou `endAt`
- Valida bot, parceiro ativo, `pricePerWorkspaceCents >= 1`, ≥ 1 workspace
- Cria a programação com `next_run_at = start_at` e `status = 'active'`
- Opcionalmente já dispara o primeiro run se `start_at <= now()`

**`partner-shop-schedule-tick`** (nova, chamada por cron a cada minuto)
- Pega programações `active` com `next_run_at <= now()`
- Para cada uma:
  - Se atingiu `total_days` ou passou de `end_at` → `completed`
  - Se bot ocupado → **enfileira o pedido** (cria com status `queued` no fluxo normal de `assign_bot_to_order`); o tick avança `next_run_at += 1 dia` mesmo assim
  - Se bot livre → cria pedido multi-ws e chama o fluxo padrão (worker desktop pega via `multi-workspace-tick`)
  - Atualiza `last_run_at`, `runs_completed`/`runs_failed`, `next_run_at = next_run_at + 1 day`

Cron via `pg_cron` + `pg_net` (a cada 5 min).

**`partner-shop-cancel-order-schedule`** (nova)
- `status = 'canceled'`, não afeta pedidos-filhos já em execução

### 3. UI

**`ManualOrderDialog.tsx`** — quando `multiWs` está ligado, adicionar um bloco "Programação recorrente":
- Switch "Repetir diariamente"
- Quando ligado: radio `Por X dias` / `Até data`
  - Input numérico de dias (1–60) **ou** date picker (shadcn Calendar)
- Texto fixo: "Disparo diário às HH:MM (mesmo horário da criação)"
- Resumo: "Vai rodar N dias × M workspaces × 200 créditos = X créditos por dia, ~Y créditos no total se a quota permitir"

Botão muda de "Criar pedido" para "Criar programação" quando recorrência está ligada.

**Nova página `src/pages/dashboard/Programacoes.tsx`** (rota `/dashboard/programacoes`)
- Lista programações com: cliente, bot, workspaces, próximo disparo, dia X/N, status, ações (pausar, retomar, cancelar)
- Drill-down: ao clicar, lista os pedidos-filhos daquela programação

**`Pedidos.tsx`** — badge "📅 Dia 3/7" quando pedido tem `schedule_id`.

**`AppSidebar.tsx`** + `lib/sidebar-tabs.ts` — novo item "Programações" (atrás da mesma flag de permissão de Pedidos).

### 4. Documentação

Atualizar `docs/desktop-updater.md`: nada muda no worker — cada run é um pedido multi-ws normal. A programação vive 100% no servidor.

---

### Decisões confirmadas
- Modo de duração: ambos (X dias **ou** data de término)
- Horário: mesmo do momento da criação
- Cobrança: por execução diária (não reserva tudo no início)
- Conflito de bot: enfileira como pedido normal e roda assim que possível

### Fora de escopo
- Programações com intervalo diferente de 24h (semanal, etc.)
- Edição de workspaces/preço de uma programação ativa (apenas cancelar e recriar)
- Notificações por email/whatsapp a cada run