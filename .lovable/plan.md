## Objetivo

Quando o bot tentar farmar e não encontrar o workspace que o cliente digitou (erro `workspace_not_found` em `execucoes_lovable.erro`), o pedido deve falhar imediatamente, devolver 100% dos créditos para o saldo do email e abrir uma UI clara avisando o motivo, pedindo para revisar o nome do workspace (mostrando apenas a orientação — sem listar workspaces de terceiros).

## O que muda

### 1. Backend — `supabase/functions/partner-shop-check-status/index.ts`

Após carregar `progress.currentExecution` (que já lê `execucoes_lovable.erro`), detectar a string `workspace_not_found`:

- Se o pedido ainda está em `processing`/`queued`/`paid` E a execução mais recente contém `workspace_not_found`:
  - Chamar `refund_order_remainder(_order_id, _reason: 'workspace_not_found')` para devolver o restante (ou tudo, se nada foi farmado) ao saldo do cliente.
  - Marcar o pedido com `failed_reason = 'workspace_not_found'` e `status = 'failed'` (via update direto, pois o RPC de refund pode não tocar o status quando ainda há tempo).
  - Liberar o bot (`farm_bots.status = 'idle'`, `current_order_id = null`) se ainda estiver atribuído ao pedido.
  - Tentar `assign_next_queued_order` para o parceiro.
- Adicionar campos no JSON de resposta:
  - `workspaceNotFound: boolean`
  - `attemptedWorkspace: string | null` (extraído do erro: `alvo='...'`)
  - `failedReason` continua sendo retornado.

Regex sugerida para extrair o alvo: `workspace_not_found:\s*alvo='([^']+)'`. A lista de "disponiveis" é descartada (não exposta ao cliente).

### 2. Frontend — `src/pages/ComprarParceiro.tsx`

a) **Tipos**: estender `OrderState` com `workspaceNotFound?: boolean` e `attemptedWorkspace?: string | null`.

b) **Tela "paid" (acompanhamento do farm)**: quando `order.workspaceNotFound === true`, substituir o painel atual de progresso por um aviso destacado (vermelho/âmbar) com:
   - Título: "Workspace não encontrado"
   - Texto: "O bot não encontrou o workspace **{attemptedWorkspace}** na sua conta Lovable. Confira se digitou o nome **exatamente igual** ao que aparece no Lovable (incluindo maiúsculas, minúsculas, espaços e acentos)."
   - Aviso: "Seus {credits} créditos foram devolvidos ao saldo do email **{customerEmail}** e você já pode refazer o pedido com o nome correto."
   - Botão primário: "Refazer pedido com nome correto" → abre o modal de refazer pré-preenchido (workspace, name, email, whatsapp), mas com o campo Workspace **vazio e em foco**, e dica visível abaixo do input: "Copie o nome exatamente como aparece no Lovable (case-sensitive)".

c) **Histórico (lista de pedidos anteriores)**: pedidos com `failed_reason = 'workspace_not_found'` ganham um badge "Workspace não encontrado" e o botão "Refazer pedido" usa o mesmo fluxo do item (b).

d) **Form principal**: reforçar a dica abaixo do input Workspace (já existe um texto "Informe o nome **exato**...") com um exemplo curto: "Ex.: 'PRO 03' é diferente de 'pro 03' ou 'PRO  03'".

### 3. Sem mudanças em

- Schema do banco (todos os campos necessários já existem: `failed_reason`, `refunded_credits`, `partner_customer_balances`).
- RPCs (`refund_order_remainder` já existe e é usado pelo watchdog).
- Watchdog (`partner-shop-stalled-watchdog`) — continua cobrindo casos de stall sem erro explícito.

## Fora de escopo

- Listar para o cliente os workspaces disponíveis na conta-mãe.
- Validar o nome do workspace antes de criar o pedido (não temos acesso à conta Lovable do cliente).
- Outros tipos de erro do worker (timeouts, falha de rede) — continuam tratados pelo watchdog/refund manual.

## Detalhes técnicos

- O detector de `workspace_not_found` roda dentro de `partner-shop-check-status` porque essa função já é chamada em polling pelo frontend e já carrega `execucoes_lovable`. Isso garante que a falha seja detectada em até ~5s sem precisar de cron extra.
- A atualização do pedido (`status='failed'`, `failed_reason`) é feita com guard `eq('status', currentStatus)` para evitar race com o webhook de pagamento.
- O refund usa o RPC já existente, então o saldo do cliente é creditado de forma transacional e auditada em `partner_credit_ledger`.
