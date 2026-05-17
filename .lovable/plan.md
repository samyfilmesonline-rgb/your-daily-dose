## Diagnóstico — pedido do `betinhoabsoluto@gmail.com` não inicia

Histórico do cliente (`partner_credit_orders`):

| id (curto) | criado | status final | target_workspace | failed_reason |
|---|---|---|---|---|
| 45a5bc3b | 12:58 | refunded | **"Em andamento"** | `worker_stalled_auto:no_exec_since_assigned` |
| ac85d492 | 13:09 | refunded | **"Em andamento"** | `workspace_not_found: alvo='Em andamento'` |
| 8bc820c3 | 13:12 | refunded | **"Em andamento"** | `workspace_not_found: alvo='Em andamento'` |
| b38ccad8 | 13:15 | refunded | **"Em andamento"** | `workspace_not_found: alvo='Em andamento'` |
| 02a0a90c | 13:18 | refunded | **"Em andamento"** | `bot_orphan` |
| 5cbefe1b | 13:25 | refunded | **"Em andamento"** | `bot_orphan` |
| cb71f332 | 13:32 | **waiting_invite** | **"Em andamento"** | aguardando cliente confirmar bot |

Causa raiz: **todos os pedidos automáticos do cliente foram criados com `target_workspace = "Em andamento"`**, que é um rótulo de status, não um nome de workspace real. O worker tenta abrir esse "workspace", o Lovable retorna `workspace_not_found` (workspaces reais dele incluem "Betinho's Lovable"), o pedido é estornado, e o cliente refaz a compra — repetindo o problema.

Como o "Em andamento" entra no pedido:

1. Na página pública `src/pages/ComprarParceiro.tsx` o cliente clica em **"Refazer pedido"** a partir do histórico (`reorderFromHistory`, linha 285): `if (item.targetWorkspace) setWorkspace(item.targetWorkspace);`
2. O histórico vem de pedidos anteriores que já tinham `target_workspace="Em andamento"` (lixo herdado de versões antigas do painel, antes das proteções adicionadas).
3. O input fica pré-preenchido com "Em andamento", o cliente confirma sem perceber e a edge function `partner-shop-create-pix` aceita o valor sem validar (não usa `assertRealWorkspaceName`, ao contrário de `partner-shop-create-manual-order` / `partner-shop-multi-workspace-tick`).
4. Cada novo Pix herda o mesmo workspace inválido. Loop infinito.

Total de pedidos no banco com `target_workspace` parecendo rótulo de status: **7** (todos deste cliente).

O pedido atual `cb71f332` está em `waiting_invite`, com bot atribuído mas ainda com o `target_workspace` ruim — mesmo se o cliente confirmar o convite agora, o worker vai falhar de novo com `workspace_not_found`.

## Mudanças propostas

### 1. Bloquear na edge function de compra pública (causa raiz)
`supabase/functions/partner-shop-create-pix/index.ts`:
- Importar `assertRealWorkspaceName` de `_shared/workspace-name.ts`.
- Validar `b.targetWorkspace` logo após o `safeParse`, devolvendo HTTP 400 com mensagem clara (`"Workspace inválido: 'Em andamento' parece um rótulo de status. Informe o nome real do workspace do Lovable do cliente."`) antes de qualquer inserção/cobrança Pix.
- Aplicar nos dois `insert` (caminho saldo-cobre-100% e caminho Pix).

### 2. Não pré-preencher workspace inválido no reorder
`src/pages/ComprarParceiro.tsx`:
- Em `reorderFromHistory`, importar `isStatusLikeWorkspace` de `@/lib/workspace-name` e só fazer `setWorkspace(item.targetWorkspace)` quando o valor for um workspace real. Caso contrário, deixar o campo vazio para o cliente digitar de novo.
- No submit (`handleConfirmar`/equivalente), rodar `assertRealWorkspaceName` antes do `functions.invoke` e mostrar erro inline em vez de mandar para o servidor.

### 3. Limpar o pedido travado e os dados ruins (migração)
Migração SQL única:
- `UPDATE partner_credit_orders SET target_workspace = NULL WHERE lower(target_workspace) IN ('em andamento','processando','aguardando','pending','processing','queued','paid','waiting','waiting_invite','waiting_workspace','delivered','failed','refunded','expired');` — limpa os 7 registros para que reorders futuros não repopulem.
- Para o pedido atual `cb71f332-72fc-48fc-bc07-9f699c74f104`: transicionar de `waiting_invite` → `waiting_workspace` e zerar `assigned_bot_id` / `assigned_at` (libera o bot `acc4d4c2` para outros pedidos). Isso permite que o painel ou o próprio cliente escolha um workspace real (ex.: "Betinho's Lovable") via a RPC `set_order_target_workspace` que já existe, sem precisar de estorno.

### 4. (Opcional, recomendado) Constraint no banco
Migração: adicionar trigger `BEFORE INSERT OR UPDATE` em `partner_credit_orders` que rejeita gravação de `target_workspace`/`current_workspace` cujo `lower(trim(...))` esteja na mesma blacklist. Defesa em profundidade — garante que qualquer edge function futura que esqueça a validação ainda assim não consiga sujar o banco.

## Arquivos afetados

- `supabase/functions/partner-shop-create-pix/index.ts` — validação `assertRealWorkspaceName`.
- `src/pages/ComprarParceiro.tsx` — guarda no reorder + validação antes do submit.
- Nova migração: limpeza dos 7 registros + reset do pedido travado + trigger opcional.

## Critérios de aceite

- Tentar comprar com `targetWorkspace="Em andamento"` em `partner-shop-create-pix` retorna 400 e nada é inserido.
- Refazer pedido a partir do histórico não pré-preenche o workspace quando o valor anterior era um rótulo de status.
- Pedido `cb71f332` deixa de ocupar o bot `acc4d4c2` e fica em `waiting_workspace`, esperando o cliente/painel informar um workspace real (ex.: "Betinho's Lovable") — sem novo Pix, sem estorno.
- Próxima compra automática deste cliente, com workspace válido, é processada pelo worker normalmente.

## Pendência de decisão (rápida)

Para o pedido travado `cb71f332` (R$ pago, créditos `paid`, mas com workspace inválido), há duas saídas — preciso saber qual aplicar:

- **(A) Recomendado:** limpar `target_workspace` e mover para `waiting_workspace`, mantendo o crédito pago. Você (ou o cliente, pela tela pública) informa o workspace real e o worker executa. Sem estorno.
- **(B)** Estornar como os anteriores (`refunded`) e pedir ao cliente que compre de novo já com a UI corrigida.
