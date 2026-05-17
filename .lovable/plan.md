## Contexto atual (o que já existe)

- **Enum de status** `partner_order_status` já contém `waiting_workspace` e `waiting_invite`, e ambos já estão tipados/exibidos no painel (`src/pages/dashboard/Pedidos.tsx` linhas 86–99).
- **Edge function** `partner-shop-set-target-workspace` + **RPC** `set_order_target_workspace` já existem e já validam contra rótulos de status (`isStatusLikeWorkspace`).
- **Trigger** `tg_block_status_like_workspace` no `partner_credit_orders` já bloqueia escrita de "Em andamento", "Processando", etc. em `target_workspace`/`current_workspace`.
- **Edge functions de criação** (`create-pix`, `create-balance-only-order`, `redeem-balance`) já rejeitam 400 quando recebem workspace inválido.
- **Frontend** `ComprarParceiro.tsx` já valida workspace antes de submeter e no reorder.
- **Dados antigos** com `target_workspace = "Em andamento"` já foram limpos e o pedido travado do `betinhoabsoluto` foi movido para `waiting_workspace`.

O que **falta** é uma camada de UX no painel para que o admin/parceiro veja claramente que falta workspace e consiga selecionar/salvar o workspace real direto do detalhe do pedido — e fechar duas brechas pequenas que ainda podem deixar pedidos parados.

## Escopo do plano

Apenas **frontend** (`src/pages/dashboard/Pedidos.tsx`) e **duas pequenas correções de borda** em edge functions já existentes. Nenhuma mudança de schema.

### 1. Selo/coluna do workspace na lista de pedidos

- Quando `status === "waiting_workspace"` (ou `paid`/`queued` sem `target_workspace` e sem `multi_workspace_mode`), mostrar selo destacado **"Selecionar workspace"** em vez do genérico "— faltando".
- Diferenciar visualmente os 4 estados conforme pedido:
  - `waiting_workspace` → roxo, texto "Falta selecionar workspace real".
  - `waiting_invite` → azul, texto "Falta confirmar bot como Owner".
  - `processing` → âmbar, "Worker executando".
  - `pending` → cinza, "Aguardando pagamento/fila".

### 2. Ação "Selecionar workspace do cliente" no diálogo de detalhe

No `Dialog` de detalhe do pedido (linhas 515+), quando `!detail.target_workspace && !detail.multi_workspace_mode`:

- Renderizar um bloco destacado com:
  - `<Input>` "Workspace do cliente" (placeholder com exemplo).
  - Botão **Salvar workspace**.
- Ao salvar:
  - validar localmente com `cleanWorkspaceName` + `isStatusLikeWorkspace` (importar de `@/lib/workspace-name`).
  - chamar `supabase.functions.invoke("partner-shop-set-target-workspace", { body: { orderId, fingerprint, workspace } })`.
  - usar como `fingerprint` o `detail.client_fingerprint` quando existir; caso contrário, um valor admin-controlado (ex.: `admin:${auth.user.id}`) — a RPC já aceita por se tratar de admin via service role na edge function.
  - em sucesso: toast "Workspace salvo", `queryClient.invalidateQueries(["pedidos"])`, fechar/atualizar detalhe.
  - em erro: toast com a mensagem do backend (já vem traduzida).

### 3. Botão "Já adicionei o bot como Owner" no detalhe

- Mostrar quando `detail.assigned_bot_id` existe e `!detail.bot_invite_confirmed_at`.
- Reaproveitar fluxo existente de confirmação de convite (edge function `partner-shop-confirm-bot-invite` se já existir; caso contrário usar update via RPC dedicada — verificar antes de implementar).
- Após confirmar:
  - se já há `target_workspace` válido → backend move para `processing`.
  - se não há → continua em `waiting_workspace` (regra 5 do briefing).
- Essa lógica de transição **já é responsabilidade do backend**; o frontend só dispara a ação e re-busca.

### 4. Migração visual de pedidos legados

- Qualquer pedido com `target_workspace` que ainda case com `isStatusLikeWorkspace(...)` deve, na renderização:
  - ser exibido como `waiting_workspace` (sobrescrever `effectiveBadge`).
  - mostrar o campo "Selecionar workspace" no detalhe.
- Não tentar reescrever no banco a partir do front — o trigger e a limpeza já cuidam disso.

### 5. Fechar brechas restantes nas edge functions de criação

Verificar e, se necessário, adicionar `assertRealWorkspaceName` também em:

- `partner-shop-create-manual-order/index.ts` (pedido manual feito pelo admin).
- `partner-shop-create-order-schedule/index.ts` (programações recorrentes podem repropagar string ruim).
- `partner-shop-multi-workspace-tick/index.ts` e `partner-shop-schedule-tick/index.ts` — confirmar que `current_workspace` nunca é setado a partir de um label de status (o trigger já protege, mas falhar cedo dá mensagem melhor).

### 6. Garantia de transição para `processing`

Confirmar (apenas leitura de função/trigger existente) que o backend só promove o pedido para `processing` quando **todas** as condições da regra 4 estiverem satisfeitas: `paid_at`, `assigned_bot_id`, `target_workspace` real, `bot_invite_confirmed_at`. Se a função `set_order_target_workspace` não fizer essa promoção automática quando o invite já estava confirmado, ajustar a RPC numa migração separada (não nesta passada, apenas registrar como follow-up se for o caso).

## Arquivos a alterar

- `src/pages/dashboard/Pedidos.tsx` — selos, coluna workspace, bloco de seleção no diálogo, botão confirmar invite.
- (eventual) `supabase/functions/partner-shop-create-manual-order/index.ts`
- (eventual) `supabase/functions/partner-shop-create-order-schedule/index.ts`

## Critérios de aceite

- Pedido em `waiting_workspace` mostra selo claro na lista e formulário inline no detalhe.
- Salvar workspace válido chama a edge function existente; rótulos de status são rejeitados client- e server-side.
- Pedidos antigos com `target_workspace = "Em andamento"` aparecem como `waiting_workspace` no front mesmo antes de o admin editar.
- Nenhum `service_role` exposto no frontend — toda escrita passa pela edge function `partner-shop-set-target-workspace`.
- Worker continua sendo o único responsável por mover para `processing`.