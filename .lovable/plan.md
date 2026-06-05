## Objetivo

Garantir que cada workspace receba no máximo **20 créditos a cada 24h** (janela móvel, global por nome de workspace). Pedidos que excedam o limite **não falham** — viram um agendamento automático que dispara assim que o cooldown acaba. Vale para pedidos manuais, automáticos, multi-workspace e schedules.

## Estratégia

- Mudar a unidade base do sistema para **20 créditos por workspace por pedido** (hoje single = N do pack, multi = 200/ws).
- Adicionar um helper SQL `workspace_cooldown_until(name)` que retorna o `timestamptz` em que o workspace volta a poder farmar, ou `NULL` se já está livre.
- Antes de criar/iniciar qualquer pedido em um workspace, consultar esse helper. Se houver cooldown:
  - **Pedido novo** → não cria a order; cria/atualiza um `partner_order_schedules` one-shot com `start_at = cooldown_until` e devolve esse horário ao cliente.
  - **Multi-ws** → particiona os workspaces da lista em "prontos agora" e "em cooldown". Os prontos rodam; os bloqueados viram schedules one-shot individuais para o respectivo `cooldown_until`.
  - **Tick de schedule** → se na hora de rodar o workspace ainda estiver em cooldown, empurra `next_run_at` para o `cooldown_until` em vez de criar o pedido.

## Mudanças

### 1. Banco de dados (migration)

- Função `public.workspace_cooldown_until(_workspace text) returns timestamptz`:
  - Olha `execucoes_lovable` dos últimos 24h para esse `workspace_nome` (normalizado, case-insensitive), considerando apenas linhas com `creditos_adicionados > 0` ou `status` em `('sucesso','concluido','limite')`.
  - Retorna `max(iniciado_em) + interval '24 hours'` se ≥ 20 créditos foram farmados na janela; senão `NULL`.
- Função `public.workspace_farmed_last_24h(_workspace text) returns int` para inspeção/uso na UI.
- Índice em `execucoes_lovable(lower(workspace_nome), iniciado_em desc)` para a consulta ficar barata.

### 2. Constante 20 créditos

- `supabase/functions/partner-shop-multi-workspace-tick/index.ts`: `PER_WS = 200` → `PER_WS = 20`. Ajusta cálculo de quota (`Math.floor(remaining / 20)`) e `limit_reached` (que hoje credita 200) para creditar 20.
- `partner-shop-create-pix`, `partner-shop-redeem-balance`, `partner-shop-create-balance-only-order`: validar que `pack.credits <= 20`; se maior, devolver erro pedindo um pacote de 20 (ou cortar para 20 — vou cortar, mantendo refund automático do excedente).
- `partner-shop-create-manual-order`: forçar `credits = 20` no modo single e `pricePerWorkspaceCents` aplicado a 20 créditos no multi.
- Constante única em `supabase/functions/_shared/limits.ts` (novo) reutilizada por todas as funções.

### 3. Enforcement do cooldown

Funções tocadas (todas chamam `workspace_cooldown_until` antes de criar/atribuir):

- `partner-shop-create-pix`, `partner-shop-redeem-balance`, `partner-shop-create-balance-only-order`, `partner-shop-force-paid-order`, `partner-shop-create-manual-order`, `partner-shop-set-target-workspace`.
  - Se cooldown ativo:
    - Não cria/atribui o pedido imediato.
    - Cria registro em `partner_order_schedules` com `end_mode='days'`, `total_days=1`, `start_at=cooldown_until`, `next_run_at=cooldown_until`, modo single, `target_workspace`, `credits_per_run=20`, `bot_id` preferido.
    - Resposta inclui `scheduledFor: cooldown_until` para a UI exibir.
- `partner-shop-multi-workspace-tick` action=`start`:
  - Particiona `allowed` em `ready` e `cooldown`. Roda `ready` (debita só `ready.length * 20`). Cria um schedule one-shot por workspace bloqueado.
  - Se `ready` for vazio, devolve sucesso com `scheduledOnly: true` e os horários.
- `partner-shop-multi-workspace-tick` action=`next`:
  - Antes de promover o próximo `pending` para `running`, valida cooldown. Se bloqueado, marca esse item como `skipped` com motivo `cooldown` e cria um schedule one-shot para ele; continua com o próximo pendente que estiver livre. Refunds calculados normalmente para skipped.
- `partner-shop-schedule-tick`:
  - Antes de spawn da order, consulta `workspace_cooldown_until`. Se ainda bloqueado, atualiza `next_run_at = cooldown_until` e não cria order nessa rodada.

### 4. Frontend

- `src/pages/dashboard/Loja.tsx`, `src/pages/ComprarParceiro.tsx`, `src/components/dashboard/loja/CheckoutCreditsDialog.tsx`, `src/components/dashboard/ManualOrderDialog.tsx`:
  - Quando a função responder com `scheduledFor`, mostrar toast/diálogo: "Esse workspace já recebeu créditos nas últimas 24h. Pedido agendado para HH:MM."
  - Em pacotes, ocultar/desabilitar os que pedem mais de 20 créditos (ou marcar como "indisponível — limite 20/ws/24h").
- `src/lib/credit-packs.ts`: revisar para refletir o novo teto de 20.

### 5. Memória do projeto

Adicionar regra em `mem://index.md`: "Cada workspace só aceita 20 créditos a cada 24h (rolling, global). Pedidos excedentes são agendados, nunca rejeitados."

## Pontos técnicos

- Cooldown é checado server-side em **todos** os caminhos — UI é apenas hint.
- Normalização do nome do workspace usa a mesma helper de `_shared/workspace-name.ts` para evitar bypass por capitalização/espaços.
- Saldo do cliente (`partner_customer_balances`) não é afetado: cooldown bloqueia o consumo, não o saldo.
- Pedidos em `failed`/`refunded` parciais já têm fluxo de refund — reaproveitado para o caso "skipped por cooldown".

## Fora de escopo

- Mudar a regra para janela de calendário (foi descartado pelo usuário).
- Limite por cliente/parceiro (foi descartado — é global por workspace).
- Migrar pedidos já existentes com >20 créditos — só vale para novos pedidos.
