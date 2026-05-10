Diagnóstico confirmado:

- Pedido atual: `26798938-85bb-4d73-8db3-1ffae1d1cfea` está `processing`, `workspaces_done = 0/2`, parado no workspace `close's Lovablee`, com `stop_requested_at` preenchido.
- Existe execução com erro para esse workspace: `Pedido interrompido: parada solicitada no Supabase`, mas o worker não chamou `partner-shop-multi-workspace-tick` com `action: "fail"` depois disso.
- O bot já foi liberado (`farm_bots.status = idle`), mas o pedido continuou `processing`.
- Causa principal: a função SQL `refund_order_remainder` ainda tem um guard antigo que faz `RETURN 0` para qualquer pedido `multi_workspace_mode = true`. Então `partner-shop-stop-order` tenta refundar/parar, mas o banco ignora multi-ws e deixa o pedido aberto.
- Segundo problema: quando o worker registra falha em `execucoes_lovable`, mas não chama o tick `fail`, o backend não converte essa falha em avanço para o próximo workspace nem em encerramento.

Plano de correção:

1. Corrigir `refund_order_remainder` para pedidos multi-workspace
   - Remover o bloqueio que ignora todo pedido `multi_workspace_mode = true`.
   - Calcular créditos já entregues pelo `workspaces_plan` e/ou execuções registradas.
   - Se o pedido foi parado antes de concluir qualquer workspace, marcar como `refunded`, devolver o saldo/cota corretamente e liberar o bot.
   - Manter idempotência para não creditar duas vezes se a função for chamada de novo.

2. Corrigir `partner-shop-stop-order`
   - Para multi-ws com `workspaces_done = 0` ou `stop_requested_at` recente/antigo, encerrar imediatamente como `refunded`/`canceled` em vez de depender do worker.
   - Para multi-ws já em progresso, manter a parada graciosa apenas quando houver workspace concluído e worker ativo; caso contrário encerrar direto.
   - Retornar `immediate: true` e `refundedCredits` reais para o front.

3. Melhorar `partner-shop-stalled-watchdog`
   - Detectar pedidos multi-ws onde o bot já está `idle` mas o pedido continua `processing`.
   - Detectar execução em `execucoes_lovable` com `status = falha` no workspace atual sem tick `fail` correspondente.
   - Nesses casos: se houver próximo workspace pendente, avançar o `workspaces_plan` para o próximo; se houve stop solicitado, encerrar e refundar.
   - Pausar a programação quando o pedido veio de `schedule_id` e falhou/parou.

4. Fortalecer `partner-shop-multi-workspace-tick`
   - No `action: fail`, garantir que o workspace atual vire `failed` e o próximo `pending` vire `running`.
   - Se `stop_requested_at` estiver preenchido, marcar pendentes como `skipped`, refundar o restante e finalizar o pedido.
   - Atualizar contador da programação (`runs_failed`/`runs_completed`) de forma consistente.

5. Limpeza do pedido atual
   - Rodar uma migração one-shot para encerrar o pedido `26798938-85bb-4d73-8db3-1ffae1d1cfea`, devolver os créditos restantes, liberar qualquer vínculo residual do bot e pausar a programação `f5a92a5d-cea7-4d3d-8440-b63d3442941f`.

Arquivos/funções afetados:

- Migração SQL: atualizar `refund_order_remainder` e limpar o pedido atual.
- `supabase/functions/partner-shop-stop-order/index.ts`
- `supabase/functions/partner-shop-stalled-watchdog/index.ts`
- `supabase/functions/partner-shop-multi-workspace-tick/index.ts`

Resultado esperado:

- Ao clicar em “Parar”, o pedido multi-workspace não fica mais preso em `processing`.
- Se o primeiro workspace der erro e o worker não chamar `fail`, o watchdog recupera o estado.
- Se o worker chamar `fail`, o backend pula para o próximo workspace automaticamente.
- Se houver parada solicitada, o pedido fecha e reembolsa sem depender do navegador/worker continuar vivo.