## Problema

Ao clicar em "Tentar novamente" no pedido `26798938...`, a Edge Function `partner-shop-retry-manual-order` retorna erro 400 com mensagem **"Nada a re-debitar (já entregue na prática)"**.

Causa: o pedido é **multi-workspace** (`multi_workspace_mode = true`, 2 workspaces, ambos terminaram como `failed`/`skipped` por parada manual), mas a função SQL `retry_manual_order` foi escrita só para o fluxo **single-workspace**:

- usa `v_order.credits` (que em pedidos multi-ws é `0` — o custo está em `price_cents_per_workspace`)
- usa `v_order.target_workspace` (NULL em multi-ws)
- não reabre o `workspaces_plan` nem zera `workspaces_done`
- chama `assign_bot_to_order` direto, ignorando o ciclo do `partner-shop-multi-workspace-tick`

Resultado: `v_to_redebit = 0 − 0 − 0 = 0` → exceção.

## O que fazer

Reescrever `retry_manual_order` para detectar `multi_workspace_mode` e, nesse caso, seguir um caminho próprio. O fluxo single-workspace continua igual.

### Caminho multi-workspace

1. Validar status (`refunded` ou `failed`), `is_manual = true`, `delivered_at IS NULL`.
2. Identificar no `workspaces_plan` os itens com `status IN ('failed','skipped')` — são os que precisam ser refeitos. Itens com `status = 'done'` permanecem intactos.
3. Calcular créditos a re-debitar: `count(workspaces_a_refazer) * (price_cents_per_workspace_em_créditos)`. Como `partner_credit_orders` em multi-ws guarda `price_cents_per_workspace` e o custo do pacote, derivar créditos por workspace a partir do `pack` (`partner_credit_packs.credits / workspaces_total`) ou do `raw_payload.multiWorkspace.creditsPerWorkspace` (verificar qual está disponível — caso necessário, ler do pack via join).
4. Validar cota do parceiro (`limite_creditos − creditos_consumidos >= total_a_redebitar`).
5. Chamar `debit_partner_quota` com `reason = 'manual_retry_multi_ws'`.
6. Resetar no plano cada workspace alvo: `status = 'pending'`, limpar `error`, `started_at`, `finished_at`, `farmed`. Manter os `done`.
7. Recalcular `workspaces_done = count(status='done')`.
8. UPDATE no pedido:
   - `status = 'paid'`
   - `assigned_bot_id = NULL`, `assigned_at = NULL`
   - `current_workspace = NULL`, `target_workspace = NULL`
   - `failed_reason = NULL`, `stop_requested_at = NULL`
   - `refunded_credits = 0`
   - `workspaces_plan` atualizado, `workspaces_done` recalculado
   - registrar entrada em `raw_payload.manualOrder.retries` (mesmo padrão atual)
9. **NÃO** chamar `assign_bot_to_order` diretamente. O `partner-shop-multi-workspace-tick` (cron) fará pickup do pedido em `paid` com `multi_workspace_mode=true` e atribuirá bot ao próximo workspace pendente.
10. Retornar `{ ok: true, status: 'paid', multiWorkspace: true, redebited, workspacesToRetry: N }`.

### Caminho single-workspace

Mantém-se o código atual sem alteração.

## Regras preservadas (do contrato existente)

- Nunca usar `'canceled'`.
- Pedido terminal limpa `current_workspace`/`target_workspace` (continua válido — só estamos reabrindo).
- `workspaces_done` sempre = contagem de `done` no plano.
- `partner-shop-multi-workspace-tick` permanece a única fonte de avanço entre workspaces.

## Arquivos

- **Migration nova**: substitui o body de `public.retry_manual_order(uuid)` com o caminho multi-ws + caminho single-ws original. Sem mudanças em outras funções.
- **Edge Function `partner-shop-retry-manual-order`**: nenhuma mudança (já delega tudo para a RPC).

## Fora de escopo

- Fluxo single-workspace
- `partner-shop-multi-workspace-tick`, watchdog, stop-order
- UI (a mensagem de erro do toast já vem do `error` retornado pela RPC)

## Verificação após deploy

Rodar contra o pedido `26798938-85bb-4d73-8db3-1ffae1d1cfea`:
- esperar `status = 'paid'`, `workspaces_done = 0` (ambos os 2 falharam/foram skipped), 2 itens do plano com `status='pending'`, créditos debitados da cota do parceiro, e tick pegar o pedido na próxima execução.
