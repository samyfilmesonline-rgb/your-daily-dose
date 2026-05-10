## Problema

Ao clicar em **"Tentar novamente"** num pedido multi-workspace, o pedido volta para `paid` mas nada acontece — fica parado, sem bot atribuído e sem worker processando.

Causa raiz: na função `retry_manual_order` (migração `20260510220457`), o caminho multi-workspace:

- Faz UPDATE para `status = 'paid'`, zera `assigned_bot_id`, `current_workspace`, `target_workspace`.
- **Mas nunca chama `assign_bot_to_order(_order_id)`** (o caminho single-workspace chama).
- E como `workspaces_total` continua preenchido e `current_workspace` fica nulo, mesmo se algum worker pegasse, a edge `partner-shop-multi-workspace-tick` action=start responderia `alreadyStarted` com `currentWorkspace: null`, deixando o worker sem saber qual workspace abrir.

## Correção (apenas migração)

Nova migração que reescreve `retry_manual_order` no trecho multi-workspace para:

1. **Reconstruir o plano** mantendo `done` e marcando o restante como `pending` (igual hoje), porém:
   - Definir o **primeiro item pending como `running`**, com `started_at = now()`.
   - Atualizar `current_workspace = target_workspace = <nome do primeiro pending>`.
2. Manter o re-debit dos créditos restantes (`v_to_retry * 200`) e o append em `manualOrder.retries`.
3. Após o UPDATE, chamar `public.assign_bot_to_order(_order_id)` (mesmo padrão do single-workspace). Isso atomicamente:
   - Encontra um bot sticky/livre, marca-o `busy`, define `assigned_bot_id` e move o pedido para `processing`.
   - Se nenhum bot disponível, deixa o pedido em `queued` (o watchdog/queue cuida depois).
4. Retornar `assignedBotId` no JSON, igual ao single-ws.

Quando o worker correspondente fizer polling e chamar `action=start`, a edge devolverá `alreadyStarted=true` já com `currentWorkspace` correto, e o ciclo `next/fail` segue normalmente — incluindo o tratamento de `workspace_ineligible:` recém-implementado.

## Não mexer

- `partner-shop-multi-workspace-tick/index.ts` (já está correto).
- Frontend (`Pedidos.tsx`): o botão "Tentar novamente" continua chamando a edge `partner-shop-retry-manual-order` que invoca a RPC.
- Worker desktop Python.
- Caminho single-workspace de `retry_manual_order`.
- Enum `partner_order_status` (continuamos sem `canceled`; usamos `paid → processing`).

## Verificação

- Pedido multi-ws em `refunded` ou `failed` com 1+ workspace `pending`/`failed`/`skipped`: clicar em "Tentar novamente" → pedido vai para `processing` (ou `queued` se nenhum bot livre), `assigned_bot_id` preenchido, `current_workspace` = primeiro pending, plan correto.
- Worker reabre a sessão, faz `action=start` → recebe `alreadyStarted` com o workspace correto e segue o fluxo normal.
- Pedido sem nada a refazer (todos `done`): mantém erro `Nada a refazer`.
