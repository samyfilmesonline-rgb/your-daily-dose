# Plano — Estados `waiting_invite` / `waiting_workspace` + guarda anti-"Em andamento"

Alinhar painel + Supabase com o worker para que:
- `target_workspace` / `current_workspace` nunca contenham rótulos visuais ("Em andamento", "Processando", "Aguardando", "Pending");
- Pedidos esperando o cliente confirmar bot ou escolher workspace não tomem bot e não fiquem como `processing`;
- A fila continue andando, pulando esses estados de espera.

## 1. Migração Supabase

Arquivo novo `supabase/migrations/<ts>_partner_order_waiting_states.sql`:

1. `partner_credit_orders.status` já é `enum partner_order_status` (confirmado em `types.ts`). Adicionar dois valores sem destruir dados:
   ```sql
   ALTER TYPE public.partner_order_status ADD VALUE IF NOT EXISTS 'waiting_invite';
   ALTER TYPE public.partner_order_status ADD VALUE IF NOT EXISTS 'waiting_workspace';
   ```
2. Atualizar `assign_next_queued_order(_partner_id)` para ignorar explicitamente `waiting_*` (já só pega `queued`, mas formalizar com filtro `AND status = 'queued'` mantido e comentário).
3. Atualizar `assign_bot_to_order(_order_id)` para abortar (retornar NULL sem tocar bot) se o pedido estiver em `waiting_invite` ou `waiting_workspace`, evitando race com triggers/webhook.
4. Atualizar `confirm_bot_invite`:
   - Aceitar pedidos em status `waiting_invite` (além de `paid/queued/processing`).
   - Após confirmar: se `target_workspace IS NULL` → `status = waiting_workspace`; senão, se ainda `waiting_invite` → `status = paid` (deixa `assign_bot_to_order` promover a `processing/queued`).
5. Criar RPC `set_order_target_workspace(_order_id uuid, _fingerprint text, _workspace text)`:
   - Valida fingerprint (igual `confirm_bot_invite`).
   - Limpa/normaliza nome (reutilizar `cleanWorkspaceName` no edge antes de chamar; aqui apenas trim/raise se vazio).
   - Bloqueia textos proibidos: lança erro se `lower(_workspace) IN ('em andamento','processando','aguardando','pending','processing','waiting_invite','waiting_workspace')`.
   - Grava `target_workspace = _workspace`, limpa `failed_reason` se era `waiting_workspace_*`, e se `bot_invite_confirmed_at IS NOT NULL` chama `assign_bot_to_order` (que vai para `processing`); caso contrário deixa em `waiting_invite`.
6. Nenhum `DROP`/`TRUNCATE`. Sem mexer em RLS.

Após a migração o `src/integrations/supabase/types.ts` será regenerado automaticamente — apenas reusar os novos valores via cast `as Database["public"]["Enums"]["partner_order_status"]`.

## 2. Edge Functions

### 2.1 Helper compartilhado `supabase/functions/_shared/workspace-name.ts`
Adicionar `isStatusLikeWorkspace(name)` e `assertRealWorkspaceName(name)` que rejeitam: `"em andamento"`, `"processando"`, `"aguardando"`, `"pending"`, `"processing"`, `"waiting"`, `"waiting_invite"`, `"waiting_workspace"`, vazio. Comparação via `normalizeWorkspaceKey`.

### 2.2 Pontos de gravação a blindar
Em cada um, passar `targetWorkspace` por `cleanWorkspaceName` + `assertRealWorkspaceName` e definir status inicial conforme regra nova:

- `partner-shop-create-pix/index.ts` (l.142, l.221): se `targetWorkspace` ausente → `target_workspace: null`. Status inicial permanece `pending` (espera Pix). Quando confirmar Pix, se ainda sem workspace, ir para `waiting_workspace` em vez de `paid`/`processing`.
- `partner-shop-create-manual-order/index.ts` (l.160, l.168):
  - Multi-WS sem plano resolvido → `status: 'waiting_invite'`, `target_workspace: null`, sem `assign_bot_to_order`.
  - Single-WS com `targetWs` válido → manter `status: 'paid'` e seguir fluxo atual.
  - Single-WS sem workspace → `status: 'waiting_workspace'`.
- `partner-shop-create-balance-only-order/index.ts` (l.75) e `partner-shop-redeem-balance/index.ts` (l.73): mesma validação.
- `partner-shop-create-order-schedule/index.ts` (l.160): validar antes de inserir.
- `partner-shop-multi-workspace-tick/index.ts` (l.131-132, 258-259): ao escolher `first` do `allowed`, validar; se `allowed` vazio → não promover a `processing`, marcar `waiting_workspace` e retornar `{ ok:true, waiting:'workspace' }`.
- `partner-shop-confirm-invite/index.ts`: já delega para RPC; RPC já passa a tratar `waiting_invite`.

### 2.3 Nova edge `partner-shop-set-target-workspace`
Cria pequena função que chama RPC `set_order_target_workspace` (validações, CORS, fingerprint) usando service-role. Frontend usa essa edge ao definir/alterar workspace; nunca faz `update` direto.

### 2.4 Webhook Pix (`abacatepay-webhook`)
Quando marcar `paid`, se o pedido não tem `target_workspace` ou `bot_invite_confirmed_at` ainda nulo, deixar status como `waiting_invite` ou `waiting_workspace` em vez de `paid`/`processing`. Não chamar `assign_bot_to_order` nesses casos.

## 3. Frontend

### 3.1 Mapa de status (`src/pages/dashboard/Pedidos.tsx`, `ComprarParceiro.tsx`, `Checkout.tsx`, `admin-checkout-list` consumers)
Estender `STATUS_MAP`:
- `waiting_invite`: rótulo "Aguardando confirmação do bot como Owner", azul.
- `waiting_workspace`: rótulo "Aguardando workspace válido", índigo.
- `processing`: rótulo "Farm em execução".

### 3.2 Guarda anti-status nos writes
- Centralizar em `src/lib/workspace-name.ts` um `assertRealWorkspaceName(name)` que lança em UI antes de qualquer chamada de edge. Usar em `ManualOrderDialog`, `Pedidos.tsx` (botão "definir workspace"), `Programacoes.tsx`, `CheckoutCreditsDialog.tsx`, `ComprarParceiro.tsx`.
- Remover qualquer caminho que envie label visual; nunca usar `STATUS_MAP[…].label` para preencher campo workspace.

### 3.3 Campo de display separado
Adicionar helper `computeOrderDisplayStatus(order)` em `src/lib/order-display.ts` que retorna `{ label, tone }` derivado de `order.status` + flags (`bot_invite_confirmed_at`, `target_workspace`, `stop_requested_at`). Componentes consomem isso para badge; `target_workspace` permanece o nome real.

### 3.4 Modal de detalhes em `Pedidos.tsx`
- Em `waiting_invite`: destacar passo "Adicionar bot como Owner" + botão `confirm_bot_invite` (já existe).
- Em `waiting_workspace`: input para selecionar workspace real (lista vinda de `useMyWorkspaces`) que chama nova edge `partner-shop-set-target-workspace`.
- Bot continua `idle` — esconder bloco "Farm em andamento" do plano anterior nesses estados.

### 3.5 Tipos
Estender union de `status` em interfaces locais (`OrderRow`, `ScheduleRow`, etc.) com `"waiting_invite" | "waiting_workspace"`. Tipos do supabase virão da regeneração após migração.

## 4. Sem alterações de RLS / secrets
- Service-role só em edges. Painel chama RPCs/edges; nenhuma mutação direta em `partner_credit_orders.status` no frontend.

## 5. Arquivos a tocar
- `supabase/migrations/<novo>.sql`
- `supabase/functions/_shared/workspace-name.ts`
- `supabase/functions/partner-shop-create-pix/index.ts`
- `supabase/functions/partner-shop-create-manual-order/index.ts`
- `supabase/functions/partner-shop-create-balance-only-order/index.ts`
- `supabase/functions/partner-shop-redeem-balance/index.ts`
- `supabase/functions/partner-shop-create-order-schedule/index.ts`
- `supabase/functions/partner-shop-multi-workspace-tick/index.ts`
- `supabase/functions/abacatepay-webhook/index.ts`
- `supabase/functions/partner-shop-set-target-workspace/index.ts` (novo)
- `src/lib/workspace-name.ts`
- `src/lib/order-display.ts` (novo)
- `src/pages/dashboard/Pedidos.tsx`
- `src/pages/dashboard/Programacoes.tsx`
- `src/pages/dashboard/Checkout.tsx`
- `src/pages/ComprarParceiro.tsx`
- `src/components/dashboard/ManualOrderDialog.tsx`
- `src/components/dashboard/loja/CheckoutCreditsDialog.tsx`

## Critérios de aceite
- Enum `partner_order_status` contém `waiting_invite` e `waiting_workspace`; dados antigos preservados.
- Nenhuma chamada (UI ou edge) consegue gravar "Em andamento"/"Processando"/"Aguardando"/"Pending" em `target_workspace`/`current_workspace` — bloqueio nas duas camadas.
- Pedido sem confirmação do bot fica `waiting_invite`, `farm_bots.status='idle'`, `current_order_id=NULL`.
- Pedido confirmado sem workspace real → `waiting_workspace`, sem bot ocupado.
- Pedido confirmado com workspace real → `processing` e bot fica `busy`.
- `assign_next_queued_order` continua atribuindo outros pedidos `queued` mesmo havendo `waiting_*` na frente.
- Realtime do painel reflete a transição para `processing` quando o workspace é definido / convite confirmado.
