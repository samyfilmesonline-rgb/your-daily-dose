# Normalização de workspaces no painel + Edge Function

## Objetivo

Garantir que todo nome de workspace lido, exibido, salvo ou enviado para Supabase/Edge Functions passe pela mesma rotina de normalização — eliminando letra/avatar duplicada no início, acentos, aspas curvas, espaços extras e sufixos de plano para comparação — e que pedidos/schedules nunca sejam criados com workspace vazio ou duplicado.

## 1. Helper compartilhado de normalização

Criar `src/lib/workspace-name.ts` com:

- `stripAvatarPrefix(name)` — se o nome começa com `X` + `[xX]...` (mesma letra repetida no começo, case-insensitive, considerando que a segunda pode ser maiúscula ou minúscula), remove a primeira letra. Exemplos:
  - `Cclose's Lovablee` → `close's Lovablee`
  - `Ddoug's Lovable` → `doug's Lovable`
  - `AAlex's Lovable` → `Alex's Lovable`
  - Não toca em `Alex's Lovable`, `Close`, `Aa` (curto demais, < 4 chars).
- `cleanWorkspaceName(name)` — `stripAvatarPrefix` + trim + colapsa espaços + normaliza aspas curvas (`’` → `'`).
- `normalizeWorkspaceKey(name)` — versão para comparação/dedupe: `cleanWorkspaceName` + lowercase + remove acentos (NFD) + remove sufixos de plano `\b(PRO|LITE|FREE|STARTER|TEAM|BUSINESS|ENTERPRISE)\b` no final.
- `dedupeWorkspaces(list)` — aplica `cleanWorkspaceName` em cada um, descarta vazios, mantém a primeira ocorrência por `normalizeWorkspaceKey`.

Espelhar a mesma lógica em `supabase/functions/_shared/workspace-name.ts` (já existe a pasta `_shared/`) para uso nas Edge Functions, com export idêntico.

## 2. Frontend — pontos de leitura, exibição e envio

Aplicar `cleanWorkspaceName` ao exibir e `dedupeWorkspaces` antes de enviar para Supabase/Edge:

- `src/components/dashboard/ManualOrderDialog.tsx` — ao montar a lista de workspaces do dropdown/multi-select (vinda de `resumo_lovable_workspace` ou input manual), passar por `dedupeWorkspaces`. Antes de chamar a edge function de criação, validar que `workspaces.length > 0` e mostrar toast "Selecione ao menos um workspace válido" caso contrário.
- `src/pages/dashboard/Pedidos.tsx` — exibir `current_workspace`, `target_workspace`, `last_workspace` e itens de `workspaces_plan[].name` via `cleanWorkspaceName`. Manter o nome bruto no banco; só limpar na renderização.
- `src/pages/dashboard/Programacoes.tsx` — mesma regra: dedupe na criação/edição, `cleanWorkspaceName` na exibição.
- `src/pages/dashboard/Workspaces.tsx` — usar `cleanWorkspaceName` na coluna de nome.

Nenhuma mudança no schema do banco. Não tocar em `senha_lovable`, secrets, service_role.

## 3. UI — separar "descobrindo workspaces" de "farm em execução"

Em `Pedidos.tsx`, no modal/linha do pedido:

- Quando `status === 'processing'` e `workspaces_total IS NULL` (ou `workspaces_plan` vazio) → badge azul "Descobrindo workspaces…" com spinner. Não mostrar progresso, não mostrar "falha".
- Quando `status === 'processing'` e `workspaces_plan` populado → barra de progresso atual `workspaces_done / workspaces_total` + nome do `current_workspace`.
- Não exibir mensagens de falha/restart durante a fase de descoberta.

## 4. Edge Functions — validação anti-vazio + uso do helper

- `partner-shop-create-manual-order` e `partner-shop-create-order-schedule`:
  - Importar `dedupeWorkspaces`/`cleanWorkspaceName` de `_shared/workspace-name.ts`.
  - Após validar o payload, aplicar dedupe. Se a lista resultante estiver vazia (ou se `target_workspace` único ficar vazio depois de limpar), retornar 400 com `{ error: "Nenhum workspace válido informado" }`.
  - Salvar `workspaces_plan`/`target_workspace` já normalizados (sem acento/sufixo perdido — guardamos o `cleanWorkspaceName`, não a key).
- `partner-shop-multi-workspace-tick` (deploy obrigatório):
  - Em `action=start`: aplicar `dedupeWorkspaces(b.workspaces)` antes de calcular `allowed`/quota. Se vazio, 400 "Nenhum workspace válido".
  - Em `action=next`/`action=fail`: localizar o item por `normalizeWorkspaceKey(target) === normalizeWorkspaceKey(plan[i].name)` antes de cair em comparação literal, para tolerar variação visual vinda do worker. Manter o `name` original do plano no update (não reescrever).
  - Não tocar em `current_workspace`/`target_workspace` fora dessa função — já é o caso, apenas reforçar.
- Demais funções que leem o plano (`partner-shop-list-orders`, `partner-shop-check-status`, `partner-shop-stalled-watchdog`, `partner-shop-stop-order`, `partner-shop-schedule-tick`, `partner-shop-redeem-balance`, `partner-shop-create-balance-only-order`, `partner-shop-create-pix`, `admin-checkout-list`): não reescrevem nomes; só consumir. Sem mudança, exceto se algum também monta plano — verificarei e replicarei dedupe se necessário.

## 5. Status — sem mudanças

Os enums já refletem o spec do usuário:
- `partner_credit_orders.status`: pending, processing, delivered, failed, refunded, expired
- `execucoes_lovable.status`: em_andamento, sucesso, falha, limite
- `workspaces_plan[].status`: pending, running, done, failed, skipped

Nenhuma migration de schema. Sem alteração de RLS.

## 6. Segurança

- Helper roda 100% client-side e em edge — nenhum dado sensível trafega.
- Nenhuma exposição nova de service_role, senhas, cartões ou chaves.
- `senha_lovable` continua restrita ao desktop conforme `SECURITY.md`.

## Fora de escopo

- Mudar enums/status no banco.
- Mexer no worker (Python/desktop) — só a edge function trata a variação recebida.
- Refatorar `refund_order_remainder` / `skip_current_workspace` (já tratado em pedidos anteriores).

## Arquivos previstos

Novos:
- `src/lib/workspace-name.ts`
- `supabase/functions/_shared/workspace-name.ts`
- `src/lib/__tests__/workspace-name.test.ts` (vitest, casos do spec)

Editados:
- `src/components/dashboard/ManualOrderDialog.tsx`
- `src/pages/dashboard/Pedidos.tsx`
- `src/pages/dashboard/Programacoes.tsx`
- `src/pages/dashboard/Workspaces.tsx`
- `supabase/functions/partner-shop-multi-workspace-tick/index.ts`
- `supabase/functions/partner-shop-create-manual-order/index.ts`
- `supabase/functions/partner-shop-create-order-schedule/index.ts`
