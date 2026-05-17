# Plano — Cancel/Retry seguros durante farm em andamento

Alinhar painel + edge functions com o worker para nunca derrubar uma sessão ativa por clique no painel. Mudanças ficam quase todas em UI + 1 edge function; lógica de RPCs já está adequada.

## 1. UI — `src/pages/dashboard/Pedidos.tsx`

### 1.1 Detectar "farm ativo"
- Já há `useMyBots` (`my-bots-mini`). Construir um `Map<botId, bot>` indexado.
- Criar helper `isFarmActive(order, botsMap)`:
  - retorna `true` quando `order.status === 'processing'` **e** o bot atribuído (`assigned_bot_id`) tem `status === 'busy'` **e** `last_heartbeat_at` recente (< 90s).
  - retorna `true` também se `order.status === 'processing'` há menos de 60s mesmo sem heartbeat (evita race no boot do worker).

### 1.2 Bloquear botões do modal de detalhes
Quando `isFarmActive(detail)` for verdadeiro:
- Desabilitar: "Parar e estornar", "Pular workspace", "Já está no limite", "Forçar concluído", "Tentar novamente", "Refazer só falhados".
- Substituir bloco por aviso: *"Farm em andamento. Aguarde o worker finalizar ou parar com segurança. Heartbeat: {x}s atrás."* + botão secundário "Solicitar parada segura" que só seta `stop_requested_at` (chama `partner-shop-cancel-manual-order` com flag/reason `stopped_by_admin`, sem confirmação dupla diferente).
- Mostrar `current_workspace`, `workspaces_done/total`, bot nickname, último heartbeat e `failed_reason` se existir (já parcialmente exposto; consolidar num bloco "Status do farm").

### 1.3 Cancelamento seguro
- O botão "Parar e estornar" passa a chamar a edge com `reason: "stopped_by_admin"`.
- UI nunca muda status localmente para `pending`; apenas invalida queries e exibe badge "parada solicitada" (já existe via `isStopping`). Mantém `delivered_at` intocado.

### 1.4 Retry seguro
- "Tentar novamente" e "Refazer só falhados" só aparecem se status ∈ `{failed, refunded}` (já é o caso) **e** `!isFarmActive`. Adicionar checagem extra: se `assigned_bot_id` ainda aparece como `busy`, bloquear com tooltip "Bot ainda ocupado — aguarde liberar".
- Multi-workspace: nada muda no payload (RPC `retry_failed_workspaces_only` já preserva `workspaces_plan`/`done`).

## 2. Edge function `partner-shop-retry-manual-order`

Adicionar guarda dura antes de chamar `retry_manual_order`:
- Se `order.status === 'processing'` → 409 `{ error: "Pedido em processamento. Aguarde o worker liberar." }`.
- Se `order.assigned_bot_id` apontar para bot com `status='busy'` e heartbeat < 90s → 409 mesma mensagem.
- Permite quando bot está `idle/offline` ou sem assignment.

Selecionar campos extras (`assigned_bot_id`) na query existente e fazer um segundo `select` em `farm_bots` para checar status/heartbeat. Sem alteração de schema.

## 3. Edge function `partner-shop-cancel-manual-order`

Repassar `reason` recebido do painel para a RPC (já repassa). Garantir que quando `reason === 'stopped_by_admin'` o comportamento seja apenas marcar `stop_requested_at` + `failed_reason='stopped_by_admin'` sem mudar status para `pending` — a RPC `cancel_manual_order` atual já faz isso (apenas seta `stop_requested_at`, deixa o worker fechar). Adicionar uma asserção: se status não é `paid|queued|processing`, retornar 400 explicando.

## 4. Stripe "Too many requests"
Já tratado em loop anterior (`limit_reached` em `partner-shop-multi-workspace-tick` + badge "limite diário" em Pedidos). Sem nova mudança — apenas validar que o caminho de single-workspace marca `delivered` quando 200 cr já foram contabilizados e não dispara retry.

## 5. Sem mudanças de schema / RLS / secrets
- Nenhuma migração necessária.
- Nenhum secret novo.
- Service role permanece apenas dentro das edges.

## Arquivos a editar
- `src/pages/dashboard/Pedidos.tsx` — helper `isFarmActive`, desabilitar botões, novo bloco "Farm em andamento".
- `supabase/functions/partner-shop-retry-manual-order/index.ts` — guarda processing/bot busy.
- `supabase/functions/partner-shop-cancel-manual-order/index.ts` — validar status permitido.

## Critério de aceite
- Cancelar em `processing` não vira `pending` (apenas `stop_requested_at`).
- Retry bloqueado em `processing` (UI desabilita + edge 409).
- Retry só procede com bot `idle`.
- Multi-workspace preserva `workspaces_plan/done/current_workspace`.
- Worker não é reiniciado por clique indevido.
