
## Problema observado

Você pulou o workspace, mas o pedido ficou como **"Falhou — all_workspaces_failed"** com **0 créditos**, mesmo tendo farmado 200. Isso aconteceu porque:

1. O workspace estava `running` mas travado — o bot não enviou `next` porque o workspace **já estava no limite diário de 200 créditos** (não havia mais o que farmar nessa janela).
2. Quando você clicou em **Pular workspace**, a função `skip_current_workspace`:
   - Marcou o ws como `skipped` com `farmed=0` (porque `execucoes_lovable.creditos_adicionados` desta rodada era 0 — os 200 créditos já estavam no workspace **antes** do pedido começar).
   - Como era o único `running` e não havia `pending`, chamou `refund_order_remainder` com motivo `skipped_last_workspace`.
   - `refund_order_remainder` viu `done_count = 0` → marcou o pedido como `failed` com `all_workspaces_failed`.
3. UI mostra "Créditos: 0" e "0% farmado" porque o pedido foi tratado como falha total, sem reconhecer que o workspace efetivamente **já estava com seus 200 créditos do dia**.

## O que vou fazer

### 1. Detectar "workspace já no limite diário" antes/durante o skip

Atualizar `skip_current_workspace(_order_id, _reason text default null)`:

- Aceitar um parâmetro opcional `_reason` (`"manual"` padrão, ou `"already_at_limit"`).
- Quando o worker (ou o admin) sinalizar `already_at_limit`, marcar o workspace como **`done`** (não `skipped`), com `farmed = 200`, e contabilizar como entregue. Isso reflete a realidade: o cliente recebeu os 200 créditos do dia naquele workspace, mesmo que farmados por outra rota.
- Sem `_reason` explícito, manter o comportamento atual (skip = skipped + parcial).

### 2. Heurística de fallback no skip manual

Quando o usuário pula um workspace `running` e o `partial` calculado por `execucoes_lovable` é `0`:

- Consultar `resumo_lovable_workspace` (ou direto na conta Lovable, via campo `meta_creditos_total` / `creditos_farmados_total` do snapshot) para verificar se o workspace está em **200/200** desde antes do `started_at`.
- Se sim, marcar como `done` com `farmed = 200` e **não** debitar refund (cliente recebeu o serviço; o pedido entra em `delivered`).
- Se não, manter `skipped` com `farmed = 0` como hoje.

### 3. Botão extra na UI: "Marcar como entregue (200 cr)"

Em `Pedidos.tsx`, no modal de detalhe, quando o workspace está `running` e o pedido é multi-workspace:

- Adicionar botão **"Workspace já está no limite — marcar como entregue"** ao lado de "Pular workspace".
- Chama `skip_current_workspace(_order_id, 'already_at_limit')`.
- Toast: "Workspace marcado como entregue (200 cr). Seguindo pro próximo…" (ou "Pedido concluído" se era o último).

### 4. Corrigir status final quando há `done` parciais misturados

Em `refund_order_remainder`, ajustar a regra final:

- Hoje: `done_count = 0 → failed`. Trocar para: se **algum** workspace tem `farmed > 0` (mesmo `skipped`), nunca usar `failed`; usar `refunded` com `failed_reason = "partial_only"`.
- Hoje: `done_count >= total → delivered`. Manter.
- UI já mostra "X cr parcial", então `refunded` com créditos > 0 fica claro.

### 5. Visual no modal

- Quando `status = failed` mas `sum(workspaces_plan.farmed) > 0`, mostrar banner amarelo: *"Pedido encerrado com X créditos parciais farmados — nenhum workspace foi 100% concluído"* em vez do vermelho atual de falha total.
- Já existe a label "parcial" por workspace; vou só ajustar o badge do header.

## Detalhes técnicos

**Migration:**

```sql
-- Atualizar assinatura de skip_current_workspace para aceitar reason
DROP FUNCTION IF EXISTS public.skip_current_workspace(uuid);
CREATE FUNCTION public.skip_current_workspace(_order_id uuid, _reason text DEFAULT 'manual')
RETURNS jsonb ...
-- Se _reason = 'already_at_limit': status do ws = 'done', farmed = 200
-- Senão: status = 'skipped', farmed = COALESCE(partial, parcial_execucoes)

-- Ajustar refund_order_remainder:
-- se v_done_count = 0 AND v_farmed = 0 → 'failed'
-- se v_done_count = 0 AND v_farmed > 0 → 'refunded' com failed_reason='partial_only'
-- demais regras inalteradas
```

**Frontend (`src/pages/dashboard/Pedidos.tsx`):**

- Novo botão "Marcar como entregue" chamando `supabase.rpc("skip_current_workspace", { _order_id, _reason: "already_at_limit" })`.
- Banner amarelo quando `status === 'failed' && farmedSum > 0` (computar de `workspaces_plan`).
- Manter labels e badges existentes.

## Fora de escopo

- Não vou mexer no worker (bot) — a detecção automática "já no limite" no lado do bot fica para outro pedido.
- Não vou mexer em `retry_manual_order` / `retry_failed_workspaces_only`.
- Não vou mudar o modelo de cobrança (200 cr/ws permanece).
