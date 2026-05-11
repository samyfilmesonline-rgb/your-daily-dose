## Diagnóstico

Backend já está atualizado:

- `partner-shop-create-manual-order` aceita `multiWorkspaceMode: true` (frontend já envia ✓).
- `partner-shop-multi-workspace-tick` controla `start/next/fail`, marca workspaces como `failed` ou `skipped` e finaliza com `delivered` (≥1 sucesso), `failed` (0 sucessos) ou `refunded` (parado).
- `cancel_manual_order` (RPC) seta `stop_requested_at = now()` e refunda — para multi-ws a finalização real (status, libera bot, limpa `current_workspace`) só ocorre quando o worker faz `next/fail` ou o watchdog age.
- Migração nova de `retry_manual_order` (já enviada) reconstrói `workspaces_plan`, define o primeiro pendente como `running`, ajusta `current_workspace` e chama `assign_bot_to_order`.

O frontend (`src/pages/dashboard/Pedidos.tsx`) já mostra o `workspaces_plan` por linha e badges por status, mas tem 4 lacunas visuais para o novo comportamento. **Nenhuma mudança em backend, RPC, edge functions ou no `ManualOrderDialog` — só ajustes em `Pedidos.tsx`.**

## Mudanças (somente `src/pages/dashboard/Pedidos.tsx`)

### 1. Adicionar `stop_requested_at` ao tipo `Order`
Já está sendo trazido pelo `select("*")`. Apenas declarar no tipo e usar.

### 2. Badge "Cancelamento solicitado" (item 4 do pedido)
Quando `stop_requested_at != null` **e** `status in ('paid','queued','processing')`:

- Na coluna Status da tabela: substituir o pill verde "Processando" por um pill âmbar `Parando… (cancelamento solicitado)` com ícone `Square`.
- No diálogo de detalhes: mostrar aviso "Cancelamento solicitado em <data> — aguardando o worker finalizar o workspace atual." e **esconder o botão "Parar e estornar"** (evita cliques duplicados que disparam erro do RPC porque o stop já foi pedido).
- Manter `statusMeta` original; criar uma função `effectiveStatusBadge(o)` que devolve `{label, cls, icon}` derivada.

### 3. Falha parcial em multi-ws (itens 2 e 5)
No painel `workspaces_plan` do diálogo:

- Adicionar uma linha de resumo no topo: `done · running · pending · failed · skipped` com contagens coloridas.
- Quando `status === 'processing'` e existir um `pending`/`running`, mostrar embaixo: `Próximo: <nome>` em vez de só "X/Y".
- Em uma linha do plano com `failed` (não `workspace_ineligible`), mostrar tooltip do erro **e** texto "continua no próximo" se ainda houver pending/running — para reforçar que falha de 1 ws não é falha do pedido.

Na coluna Workspace da tabela (multi-ws): trocar o texto plano `todos os ws · X/Y` por uma barra `Progress` fina + `X/Y workspaces` para dar visualização imediata.

### 4. Status final multi-ws com mensagens corretas
No diálogo, quando multi-ws e `status` final:

- `delivered` com algum `failed`/`skipped` no plano: mostrar nota "Entregue parcialmente — N workspace(s) com falha/ignorado." (sem alterar o pill).
- `failed`: usar `failed_reason` do backend (`all_workspaces_failed`) e exibir "Nenhum workspace foi concluído com sucesso."
- `refunded`: mostrar "Cancelado — N de M workspaces concluídos antes da parada."

### 5. Retry com cópia adequada para multi-ws (item 3)
No bloco "Tentar novamente":

- Para multi-ws, calcular `pendingCount = plan.filter(w => w.status !== 'done').length` e mostrar:
  - Texto: "Vai reprocessar **N workspace(s)** que ainda não foram concluídos. Re-debita 200 créditos por workspace e tenta atribuir um bot."
  - Confirmação: `Re-debitar ${N*200} créditos e refazer ${N} workspace(s)?`
- Para single-ws, manter a cópia atual.
- Não mexer no payload da chamada — `partner-shop-retry-manual-order` já cuida do restante (limpar `current_workspace`, reatribuir bot, etc., via a migração já aprovada).

### 6. Status enums
Manter exatamente os 8 já presentes em `OrderStatus` (`pending|paid|queued|processing|delivered|failed|expired|refunded`) — coincide com o enum `partner_order_status`. Sem `canceled`.

## Verificação

- Criar pedido multi-ws com bot ocupado → tabela mostra barra `Progress` 0/N.
- Worker rodando → badges por workspace atualizam (running/done) e resumo aparece no topo do plano.
- Clicar "Parar" em pedido multi-ws → pill vira "Parando…", botão some, painel mostra "Cancelamento solicitado em…". Quando o worker fechar o ciclo, status final aparece corretamente (`refunded` com texto "N de M concluídos").
- Em pedido com 1 workspace `failed` mas outros ainda `pending` → status continua "Processando" e a linha falha mostra "continua no próximo".
- Pedido `failed` ou `refunded` → botão "Tentar novamente" usa cópia multi-ws com a contagem correta de workspaces a refazer; após clicar, realtime traz `processing` com `current_workspace` = primeiro pending.
- Single-ws continua com a cópia/comportamento antigos (sem regressão).
