
## Diagnóstico

Você criou o pedido `2dd628c1…` com **modo multi-workspace** habilitado. Ele foi gravado corretamente (`multi_workspace_mode=true`, `target_workspace=null`, `credits=0`, `workspaces_total=null`) e atribuído ao bot. Porém:

- O **app desktop (worker em Python)** ainda **não conhece** o novo endpoint `partner-shop-multi-workspace-tick`. Ele continua rodando o fluxo antigo, que olha para `target_workspace` / `credits`.
- Como `credits = 0`, alguma rotina de fechamento (watchdog ou release_bot) executou `refund_order_remainder` e a função antiga concluiu: `v_farmed (0) >= v_order.credits (0)` → marcou o pedido como **`delivered`** instantaneamente, com 0 créditos farmados. Por isso "o farm não iniciou".

Ou seja, há **duas frentes**: (1) blindar o backend para nunca auto-entregar pedidos multi-workspace antes do worker chamar `start`; (2) o desktop precisa ser atualizado para usar o novo contrato — só com isso o farm de fato roda.

## O que vou implementar (lado Lovable)

### 1. Migração SQL — guards no fluxo legado
- `refund_order_remainder`: se `multi_workspace_mode = true` **e** `workspaces_total IS NULL` (worker ainda não iniciou), não fazer nada — apenas retornar 0 sem alterar status. Se `workspaces_total IS NOT NULL`, delegar ao tick (já é o caminho atual).
- `release_bot(_success=true)`: se for pedido multi-workspace, **não** marcar como `delivered`; apenas devolver bot ao `idle` se a função tick já tiver finalizado (status já em `delivered/failed/canceled`). Caso contrário, ignora.
- `assign_bot_to_order` / watchdog (`partner-shop-stalled-watchdog`): pular pedidos multi-workspace com `workspaces_total IS NULL` há menos de X minutos (sem timeout agressivo); para >X minutos sem `start`, marcar como `failed` com motivo `worker_did_not_start_multi_ws` e liberar bot.
- Reabrir/limpar o pedido travado `2dd628c1…`: apagá-lo (já não consumiu cota) e liberar o bot — vou rodar via migração `DELETE` segura escopada por id.

### 2. Edge function `partner-shop-create-manual-order`
- Validar `pricePerWorkspaceCents >= 1` (hoje permite 0; o pedido criado tinha 0).
- Persistir `credits = NULL` em vez de 0 quando multi-mode (evita match acidental com `v_farmed >= credits`). Caso o tipo da coluna não permita NULL, manter 0 mas confiar no guard SQL.

### 3. UI
- `ManualOrderDialog.tsx`: quando o switch "Farmar todos os workspaces" estiver ligado, exibir aviso amarelo claro:
  > ⚠️ Requer desktop atualizado (versão com suporte a multi-workspace). Pedidos criados nesse modo ficam aguardando o worker enviar a lista de workspaces; o farm só inicia depois disso.
- `Pedidos.tsx`: para pedidos multi com `workspaces_total IS NULL`, mostrar status "Aguardando worker iniciar (multi-ws)" em vez do estado genérico.

### 4. Documentação
- Reforçar em `docs/desktop-updater.md` que **sem a atualização do worker, pedidos multi-workspace não rodam**, e adicionar exemplo Python mínimo: login → listar workspaces → POST `start` → loop `next/fail`.

## O que precisa ser feito FORA do Lovable (responsabilidade sua)

Atualizar o app desktop em Python para:
1. Detectar `multi_workspace_mode === true` no payload do pedido.
2. Logar na conta do bot, listar todos os workspaces.
3. Chamar `POST /functions/v1/partner-shop-multi-workspace-tick` com `action: "start"` enviando a lista.
4. Farmar 200 créditos no `currentWorkspace` recebido; ao terminar chamar `next` (ou `fail`); repetir até `done: true`.

Sem isso, mesmo com os guards o farm continuará parado em "Aguardando worker iniciar".

## Fora de escopo
- Implementar/alterar código do worker desktop (não está no projeto Lovable).
- Mudar o fluxo single-workspace existente.
