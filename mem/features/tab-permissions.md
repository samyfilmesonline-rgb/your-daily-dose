---
name: Permissões de abas do sidebar
description: Sistema admin-controlado para liberar abas do sidebar a usuários específicos, com catálogo único e RLS.
type: feature
---

## Regra

Admins podem liberar QUALQUER aba do sidebar para qualquer usuário, individualmente. Toda aba nova adicionada ao app deve ser registrada no catálogo único `src/lib/sidebar-tabs.ts` — assim aparece automaticamente no painel de permissões do admin sem código adicional.

Usuários comuns só veem a aba "Visão geral" por padrão. Parceiros ativos veem o conjunto padrão de parceiro (Clientes, Workspaces, Licenças). Admins veem tudo. Qualquer usuário pode receber abas extras via permissão explícita.

## Componentes

- **Tabela `public.tab_permissions`**: `(user_id, tab_key, granted_by, created_at)` com unique `(user_id, tab_key)`. RLS: SELECT para o próprio usuário ou admin; INSERT/UPDATE/DELETE só admin.
- **Função `public.has_tab_access(_user_id uuid, _tab text)`**: SECURITY DEFINER, retorna true se admin OU se houver linha em `tab_permissions`. Pode ser usada em RLS de outras tabelas.
- **Catálogo `src/lib/sidebar-tabs.ts`**: define `SIDEBAR_TABS` (key, title, url, icon, defaultVisibility, alwaysOn) e helper `canAccessTab`.
- **`useAuth`**: expõe `tabPermissions: Set<string>`, `refreshTabPermissions()` e `isActivePartner`.
- **`AppSidebar`**: renderiza a partir do catálogo via `canAccessTab`.
- **`ActivePartnerRoute`**: aceita admin, parceiro ativo OU usuário com permissão explícita `licencas`.
- **Painel admin**: em `/dashboard/users`, botão "Permissões" abre `TabPermissionsDialog` com checkboxes para cada aba do catálogo (exceto `alwaysOn`).

## defaultVisibility

- `always` — todo autenticado
- `partnerOrAdmin` — parceiro ativo ou admin
- `adminOrActivePartner` — parceiro ativo ou admin (Licenças)
- `adminOnly` — só admin

Em todos os casos, uma linha em `tab_permissions` libera o acesso para o usuário, independente do default.

## Como adicionar uma aba nova

1. Adicionar entrada em `SIDEBAR_TABS` em `src/lib/sidebar-tabs.ts`.
2. Criar a rota correspondente em `src/App.tsx`.
3. (Opcional) Aplicar guard de rota se a aba for restrita; ler `tabPermissions.has("<key>")` para bypass.
4. Pronto: a aba aparece automaticamente no painel de permissões do admin.