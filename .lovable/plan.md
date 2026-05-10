## O que aconteceu

O pedido `00e21be9` (multi-workspace, criado pela programação `3cf4042a`) foi atribuído ao bot, mas o worker no desktop entrou em loop (abre/fecha o navegador) e **nunca chegou a chamar `start`** no `partner-shop-multi-workspace-tick`. Resultado no banco: `workspaces_total = NULL`, `workspaces_done = 0`, `current_workspace = NULL`, `status = processing`, `stop_requested_at = 21:05:42`.

A função `partner-shop-stop-order` só marca `stop_requested_at` e **espera o worker chamar a próxima tick para refundar e liberar o bot**. Como o worker está crashando, o "Parar" fica eternamente sem efeito e o pedido trava.

O `partner-shop-stalled-watchdog` também não resgata esse caso: ele só procura atividade em `execucoes_lovable` filtrando por `target_workspace` (que é `NULL` em multi-ws), então sempre conclui "still_progressing" e ignora.

## Correções

### 1. `partner-shop-stop-order` — parar de verdade quando dá pra parar agora

Lógica nova no edge function:

- Se `multi_workspace_mode = true` **e** (`workspaces_total IS NULL` ou `workspaces_done = 0` ou `assigned_at` há mais de ~2 min sem progresso): chama direto `refund_order_remainder(_reason: 'stopped_by_customer_pre_start')`. Isso já libera o bot (vira idle), reembolsa 100% (saldo do cliente para PIX, cota do parceiro para manual) e fecha como `refunded`.
- Caso contrário (worker já começou e está farmando): mantém o comportamento atual (só marca `stop_requested_at`, o tick conclui na próxima troca de workspace).

### 2. `partner-shop-stalled-watchdog` — detectar travas multi-ws

Adiciona um segundo passo no loop, só para multi-ws:

- Se `multi_workspace_mode = true` e (`workspaces_total IS NULL` ou (`workspaces_done = 0` e nenhuma execução `execucoes_lovable` desde `assigned_at` para o `email_lovable` do bot, **independente** de workspace), e `assigned_at < cutoffStall`): refunda + libera o bot.
- Se `stop_requested_at IS NOT NULL` e passou ~2 min sem progresso: refunda + libera. Isso vale também para single-ws.

### 3. Pausar automaticamente a programação quando o run falha

No `partner-shop-multi-workspace-tick` (action `fail`) e no novo caminho do watchdog: se o pedido tinha `schedule_id`, incrementar `runs_failed` na `partner_order_schedules`. Se 2 falhas consecutivas (ou seja, sem `runs_completed` novo entre elas), setar `status = 'paused'` na programação e gravar uma `failed_reason` legível. Evita que amanhã rode de novo travando outro bot.

### 4. Limpar o pedido atual (one-shot via SQL)

Rodar `refund_order_remainder('00e21be9-...', 'stopped_by_customer_manual_cleanup')` para liberar o bot agora. Pausar a programação `3cf4042a-...` para o usuário decidir o que fazer.

### 5. UI

Sem mudanças visuais — o botão "Parar" já existe. Só passa a funcionar instantaneamente nesse cenário. Opcional: toast mostra "Reembolsado X créditos" usando o `refundedCredits` que o endpoint já retorna.

## Arquivos afetados

- `supabase/functions/partner-shop-stop-order/index.ts` — lógica de parar imediato.
- `supabase/functions/partner-shop-stalled-watchdog/index.ts` — detecção multi-ws e stop_requested_at parado.
- `supabase/functions/partner-shop-multi-workspace-tick/index.ts` — incrementa contador de falhas no schedule.
- Migration nova: função opcional `pause_schedule_after_failures(uuid)` (helper) e cleanup do pedido travado.

## Fora de escopo

- Investigar por que o worker desktop está em loop de login (precisa logs do app Python). O backend agora vai destravar sozinho mesmo se o worker continuar quebrado.
