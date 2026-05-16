## Problemas observados no print

Pedido multi-workspace parado/falhado mostra estado errado:

1. **"Workspace atual ... 0 cr · falhou"** — workspace que estava `running` perde o que já foi farmado. Hoje o worker só reporta `farmed` quando chama `action=next` (sucesso). Se parar no meio, nada do parcial é gravado no `workspaces_plan`.
2. **"Créditos: 0" / "Valor: R$ 0,00" / "0 / 0 créditos farmados" / "PROGRESSO 0%"** — `refund_order_remainder` (multi) faz `credits = v_farmed` somando só workspaces `done`. Como o `running` virou `skipped` sem farmed gravado, o total fica 0. Além disso, a query "progresso ao vivo" depende de `target_workspace`, que é zerado no refund, então a UI mostra 0/0.
3. **"Workspace: — (todos · 1/1)"** — após o refund, `current_workspace` e `target_workspace` viram NULL, então a UI não mostra mais qual workspace estava rodando.
4. **"Tentar novamente" zera tudo** — `retry_manual_order` (multi) só preserva linhas `done` no plano; tudo que foi parcialmente farmado em workspaces não-concluídos some das métricas, e o "progresso ao vivo" volta a contar do zero porque filtra por `assigned_at`.
5. Faltam botões de controle além de "parar" e "tentar novamente".

## Correções

### Backend

**a) Heartbeat de progresso no `partner-shop-multi-workspace-tick`**

Adicionar `action: "progress"` no worker payload: `{ orderId, fingerprint, workspace, farmed }`. Atualiza `plan[idx].farmed = max(plan[idx].farmed, farmed)` sem mudar status. O worker chama isso a cada N créditos farmados (ou no `Ctrl+C` antes de morrer).

**b) Snapshot do parcial ao parar/falhar (`refund_order_remainder` multi path)**

Antes de marcar `running` → `skipped`, fazer um best-effort: somar `execucoes_lovable` para `(partner_id, bot_email, workspace_name)` desde `started_at` do item, e gravar esse `farmed` no plano. Garante que mesmo sem heartbeat o parcial fica salvo.

**c) Preservar `target_workspace`/`current_workspace`**

Em `refund_order_remainder` (multi) e no `multi-workspace-tick` quando `isFinal`, não zerar `current_workspace` — manter a referência do último que rodou. Adicionar coluna nova `last_workspace text` se preferir não reusar, ou simplesmente parar de setar `current_workspace = NULL`.

**d) Não destruir histórico em `retry_manual_order` (multi)**

Em vez de descartar `farmed` dos workspaces não-`done`, mover para um array `workspaces_history` (jsonb) com snapshot da tentativa anterior antes de rebuild. UI passa a somar `done` atual + soma do histórico para "total farmado acumulado".

**e) Novas ações de controle** (edge function única `partner-shop-order-action` ou endpoints separados):

- **Pular workspace atual** — marca `running` como `skipped`, continua para o próximo (sem cancelar pedido inteiro).
- **Reatribuir bot** — libera bot atual, força nova atribuição (útil quando bot trava).
- **Refazer só os falhados** — variante de retry que rebuilda só workspaces `failed`/`skipped`, ignora `done` e `running`.
- **Forçar conclusão** — admin marca pedido como `delivered` com o que já farmou, faz refund do restante.

### Frontend (`src/pages/dashboard/Pedidos.tsx`)

**f) Query de progresso multi-workspace**

Quando `multi_workspace_mode`, em vez de filtrar `execucoes_lovable` por `target_workspace` (que pode ser null), filtrar por lista de `plan.map(w => w.name)` e somar tudo. Mostrar "X / Y créditos (todos os workspaces)" no painel de progresso ao vivo.

**g) Exibir parcial gravado**

Na lista de workspaces, quando `status` for `skipped` ou `failed` mas `farmed > 0`, mostrar "X cr parcial" em vez de "0 cr · falhou".

**h) Cabeçalho do pedido**

- "Workspace:" mostra `current_workspace ?? last_workspace ?? primeiro_done` em vez de "—".
- "Créditos:" mostra `sum(plan.farmed)` (não só dos `done`) quando pedido finalizado.

**i) Botões novos no dialog de detalhes** (estados `processing`/`paid`/`queued`):

- **Pular workspace** (ícone `SkipForward`)
- **Trocar bot** (ícone `RefreshCcw`)

Em estados `refunded`/`failed`/`delivered parcial`:

- **Tentar novamente (tudo)** — existente
- **Refazer só falhados** — novo
- **Forçar concluído** — novo (admin only)

Cada botão com `AlertDialog` de confirmação descrevendo o impacto (re-débito de cota, refund parcial, etc).

## Migrations envolvidas

- `partner_credit_orders.workspaces_history jsonb default '[]'::jsonb`
- (opcional) `partner_credit_orders.last_workspace text`
- Atualizar `refund_order_remainder` (snapshot parcial + preservar workspace).
- Atualizar `retry_manual_order` (mover histórico).
- Nova RPC `skip_current_workspace(_order_id, _fingerprint)`.
- Nova RPC `force_complete_order(_order_id)` (admin).

## Fora de escopo

- Reescrever a UI de pedidos do zero.
- Mudar o modelo single-workspace.
- Alterar quanto cada workspace farma (continua 200).
