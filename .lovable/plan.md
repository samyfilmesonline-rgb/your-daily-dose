# Corrigir sistema de permissões de abas

## Diagnóstico

O usuário `endersonhacker@gmail.com` tem `status = 'ativo'` na tabela `parceiros`. Hoje, ser "parceiro ativo" libera automaticamente várias abas (Clientes, Workspaces, Licenças) pelo `defaultVisibility`, ignorando o painel de checkboxes do admin. Resultado: desmarcar não tem efeito.

Também o `ActivePartnerRoute` permite entrar em `/dashboard/licencas` por URL direta sempre que o usuário for parceiro ativo, mesmo sem a permissão `licencas` marcada.

## Mudança de modelo

Tornar o painel de permissões a **única fonte de verdade** para usuários comuns (não-admin). Admin continua vendo tudo. Parceiro ativo deixa de ganhar abas automaticamente — precisa receber permissão explícita do admin (igual a qualquer outro usuário).

Exceção: a aba "Visão geral" (`overview`) continua `alwaysOn` para todo mundo logado.

## Frontend

1. **`src/lib/sidebar-tabs.ts`** — simplificar `canAccessTab`:
   - se `tab.alwaysOn` → true
   - se `ctx.isAdmin` → true
   - senão → `ctx.tabPermissions.has(tab.key)`
   - remover toda a lógica de `defaultVisibility` baseada em `isActivePartner` / `partnerOrAdmin` / `adminOrActivePartner`. Manter o campo só como rótulo informativo (ou remover de vez).

2. **`src/components/auth/ActivePartnerRoute.tsx`** — renomear conceito: agora deve checar `isAdmin || tabPermissions.has('licencas')`. Não basta mais ser "parceiro ativo" para entrar em Licenças por URL.

3. **`src/components/dashboard/users/TabPermissionsDialog.tsx`** — corrigir o warning do React (`Function components cannot be given refs` em `DialogFooter`): envolver o conteúdo do `DialogContent` para evitar o ref no Footer, ou usar `forwardRef` no wrapper. Na prática: remover qualquer componente custom que esteja recebendo ref implícito; o warning vem de algo no children — vou inspecionar e ajustar.

4. **Auto-refresh ao trocar permissões do próprio usuário**: já existe `refreshTabPermissions`. Adicionar também um refetch quando o admin altera permissões de outro usuário logado em outra aba — fora do escopo agora; basta o usuário recarregar.

## Backend

Sem mudanças de schema. As policies de `tab_permissions` já estão corretas (admin gerencia, usuário lê o próprio).

## Comportamento após a mudança

| Usuário | Vê no sidebar |
|---|---|
| Admin | Todas as abas |
| Usuário comum sem permissões | Apenas "Visão geral" |
| Usuário comum com `accounts` marcado | "Visão geral" + "Clientes" |
| Parceiro ativo sem permissões | Apenas "Visão geral" (mudança!) |
| Parceiro ativo com `licencas` marcado | "Visão geral" + "Licenças" |

E `/dashboard/licencas` por URL direta exige `isAdmin` ou permissão `licencas` explícita.

## Arquivos alterados

- `src/lib/sidebar-tabs.ts` — simplificar `canAccessTab`
- `src/components/auth/ActivePartnerRoute.tsx` — checar permissão explícita
- `src/components/dashboard/users/TabPermissionsDialog.tsx` — corrigir warning do ref
- `mem/features/tab-permissions.md` — atualizar regra: "permissões são autoritativas; ser parceiro ativo não concede abas"
