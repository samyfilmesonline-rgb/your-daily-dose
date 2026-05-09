# Manter bot fixo por workspace nos retries

## Problema

Hoje, quando um pedido é refeito (retry manual ou nova compra automática do mesmo cliente/workspace), o sistema escolhe **qualquer bot idle** do parceiro. Resultado:

- O bot que já tinha o convite aceito daquele workspace fica preterido.
- Outro bot é convidado de novo → cliente vê convite duplicado, dados "trocando".
- O card do bot mostra `current_order_id` apontando para o pedido novo, enquanto o histórico de execuções (`execucoes_lovable`) ainda referencia o bot antigo no mesmo workspace → parece mistura de informação.
- Em `retry_manual_order`, o código zera `assigned_bot_id` antes de re-atribuir, garantindo que o bot mude se outro estiver mais "antigo" no critério `last_heartbeat_at`.

## Objetivo

Sempre que houver retry (manual) ou novo pedido (automático) para o mesmo `customer_email` + `target_workspace` daquele parceiro, **reusar o bot que já farmou esse workspace**, mesmo que outro bot esteja idle. Se o bot histórico estiver ocupado/desabilitado, o pedido vai pra fila esperando ele liberar (não troca).

## Mudanças

### 1. Nova função `find_sticky_bot_for_order(_order_id)` (SECURITY DEFINER)

Lógica de escolha, em ordem de prioridade:

1. Se `partner_credit_orders.raw_payload->>'preferredBotId'` estiver setado e o bot for idle → usa ele.
2. Senão, busca em `execucoes_lovable` o `email_lovable` mais recente que o parceiro já usou para `target_workspace` (mesmo cliente). Se existir bot correspondente em `farm_bots` (mesmo `partner_id`+`email_lovable`) e estiver idle → usa.
3. Senão, busca pedidos anteriores do mesmo `customer_email`+`target_workspace` desse parceiro com `assigned_bot_id` não-nulo. Se aquele bot for idle → usa.
4. Fallback: bot idle qualquer (comportamento atual).

Retorna `bot_id` ou NULL. **Não** faz fallback automático para "outro bot" se o sticky existir mas estiver busy — devolve NULL nesse caso e o caller coloca em `queued`.

### 2. Atualizar `assign_bot_to_order`

Substituir a query "qualquer bot idle mais antigo" pela chamada à `find_sticky_bot_for_order`. Se retornar NULL → `status = 'queued'`. Mantém claim atômico (`UPDATE ... WHERE status='idle'`).

### 3. Atualizar `retry_manual_order`

- **Não** zerar `assigned_bot_id` automaticamente. Guardar o original em `raw_payload.manualOrder.preferredBotId`.
- Se o bot original existir e estiver idle → reatribui ele direto (claim atômico).
- Se estiver busy → marca `queued` com `preferredBotId` setado; quando ele liberar, `assign_next_queued_order` (via `find_sticky_bot_for_order`) reatribui ao mesmo bot.
- Se o bot original tiver sido deletado/disabled → cai na lógica sticky por workspace.

### 4. Atualizar `assign_next_queued_order`

Já chama `assign_bot_to_order`, então herda o comportamento. Acrescentar: quando um bot fica idle, priorizar pedidos `queued` que tenham aquele bot como `preferredBotId` antes dos demais (FIFO só entre os "sem preferência").

### 5. Frontend — ManualOrderDialog (retry)

Quando o usuário abrir um retry, pré-selecionar o bot do pedido anterior (se houver) e mostrar badge "Bot original do pedido". Não muda a lógica do servidor, só clareza visual.

### 6. UI Bots — invalidar queries quando pedido muda

Garantir que `PartnerBotsDialog` e listagem de bots façam `invalidateQueries` em mudanças de `partner_credit_orders` (já existe realtime em `Pedidos.tsx`; estender para o card do bot) para evitar exibir `current_order_id` defasado.

## Arquivos afetados

- `supabase/migrations/<novo>.sql` — funções `find_sticky_bot_for_order`, `assign_bot_to_order`, `retry_manual_order`, `assign_next_queued_order`.
- `src/components/dashboard/ManualOrderDialog.tsx` — pré-seleção do bot original em retry.
- `src/components/dashboard/partners/PartnerBotsDialog.tsx` — invalidação ao mudar pedidos.

## Riscos / observações

- Pedidos antigos sem `execucoes_lovable` no workspace simplesmente caem no fallback (comportamento atual) — sem regressão.
- Se o bot "sticky" estiver `disabled`, pedido vira `queued` indefinidamente; mitigação: se o bot estiver disabled (não busy), permitir fallback para outro bot idle.
- Watchdog de stalled segue funcionando — quando libera o bot, `assign_next_queued_order` reatribui priorizando `preferredBotId`.
