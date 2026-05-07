## Plano

1. **Corrigir a tela do cliente final**
   - Ajustar `ComprarParceiro.tsx` para não encerrar o polling quando o pedido muda apenas para `paid`/`queued`.
   - Só mostrar a tela final com o e-mail do bot quando o backend retornar `botEmail` ou quando o pedido estiver realmente `processing`/`delivered` com bot atribuído.
   - Se estiver pago mas sem bot, manter uma mensagem de fila e continuar consultando até o bot aparecer.

2. **Corrigir o endpoint de status**
   - Ajustar `partner-shop-check-status` para recarregar o pedido após chamar `assign_bot_to_order`, porque hoje ele consulta o `assigned_bot_id` antigo e pode responder sem o bot mesmo depois de atribuir.
   - Retornar também um estado claro para o frontend: `paid_without_bot`, `queued`, `processing`, `delivered`, e `botEmail` quando existir.

3. **Blindar o fluxo do webhook**
   - Melhorar logs/retorno do `abacatepay-webhook` quando chama `assign_bot_to_order`, para ficar claro se encontrou bot, colocou em fila ou falhou.
   - Garantir que pedidos já `paid`, `queued` ou `processing` possam ser reprocessados de forma idempotente sem perder atribuição.

4. **Validar com teste direto**
   - Testar o endpoint `partner-shop-check-status` com um pedido recente/pago para confirmar que, havendo bot idle, retorna o `botEmail`.
   - Se não houver bot idle, confirmar que o cliente continua vendo “na fila” em vez de parar o fluxo sem receber o bot.

## Detalhes técnicos

O bug provável está em dois pontos combinados:

- O frontend avança para `paid` assim que recebe qualquer update `paid/queued/processing/delivered`, mas busca o bot só uma vez. Se o primeiro update for `paid`, o bot ainda pode não ter sido atribuído.
- O endpoint `partner-shop-check-status` chama `assign_bot_to_order`, mas continua usando o objeto `order` carregado antes da atribuição; por isso `assigned_bot_id` ainda vem vazio nessa resposta.