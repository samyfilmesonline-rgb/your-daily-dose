O problema atual é de banco/estado, não da tela: o novo pedido `8560b498-abfe-4429-ab62-a90d89f7eb0c` está `queued`, mas existem vários bots `idle`. Ele não inicia porque a regra de “bot fixo por workspace” tenta reutilizar o bot histórico do workspace `PRO 04`; esse bot está marcado como `busy` apontando para um pedido antigo já `refunded` (`09101730-cc69-43b6-a9ab-34c9f4cd3158`). Como a função vê esse bot como ocupado, ela deixa o novo pedido na fila em vez de cair para outro bot livre.

Plano de correção:

1. Criar uma migration de banco para limpar bots travados:
   - liberar qualquer `farm_bots.status = busy` cujo `current_order_id` aponta para pedido finalizado (`refunded`, `delivered`, `failed`, `expired`);
   - isso remove o bloqueio causado por pedidos antigos já encerrados.

2. Corrigir a função `find_sticky_bot_for_order`:
   - quando o bot histórico/preferido estiver `busy`, verificar se o `current_order_id` dele ainda é um pedido realmente ativo;
   - se o pedido atual do bot já estiver finalizado ou inexistente, liberar esse bot e permitir a atribuição;
   - manter a espera apenas quando o bot estiver ocupado com pedido ativo de verdade.

3. Corrigir o pedido atual:
   - após liberar o bot travado, chamar `assign_next_queued_order` para o parceiro `1dc707a3-c9dd-4b0a-91f8-24f264eee0b6`;
   - o pedido `8560b498-abfe-4429-ab62-a90d89f7eb0c` deve sair de `queued` para `processing`, com `assigned_bot_id` preenchido e o bot marcado como `busy`.

4. Validar no banco:
   - confirmar que o pedido novo ficou `processing`;
   - confirmar que o bot atual aponta para esse pedido;
   - confirmar que pedidos antigos finalizados não continuam prendendo bots.

Não vou mexer no front-end nem criar novo pedido: a correção é no estado do farm e na regra de atribuição para impedir que isso volte a acontecer.