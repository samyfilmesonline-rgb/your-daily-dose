## Acesso ADMIN ao CRM

Implementar sistema de papéis (roles) seguro com **admin global** que vê e gerencia tudo de todos os usuários, mais uma página dedicada para gerenciar quem é admin.

### 1. Banco de dados (migration)

- Criar enum `app_role` com valores `admin` e `user`.
- Criar tabela `user_roles` (`id`, `user_id`, `role`, `criado_em`) com RLS ativa.
- Criar função `SECURITY DEFINER` `has_role(_user_id, _role)` para evitar recursão em policies.
- Criar tabela `profiles` simples (`id`, `email`, `criado_em`) sincronizada via trigger `on_auth_user_created` para listar usuários (a tabela `auth.users` não pode ser lida pelo cliente).
- Trigger no `auth.users`:
  - Cria profile para todo novo usuário.
  - Se o email for **`SEU_EMAIL_AQUI`** (você me confirma qual usar), insere automaticamente role `admin` em `user_roles`. Caso contrário, role `user`.
- Atualizar policies RLS de `contas_lovable` e `execucoes_lovable`:
  - SELECT/UPDATE/DELETE: dono OU `has_role(auth.uid(), 'admin')`.
  - INSERT permanece restrito ao dono.
- Policies de `user_roles`: usuário lê o próprio role; apenas admin pode INSERT/DELETE.
- Policies de `profiles`: usuário lê próprio; admin lê todos.

### 2. Frontend

**`useAuth`**: expor flag `isAdmin` consultando `user_roles` após login.

**Sidebar**: mostrar item "Usuários" só para admin; badge "ADMIN" no rodapé.

**Páginas existentes (Accounts, Workspaces, Overview)**:
- Quando `isAdmin`, queries deixam de filtrar por `id_do_usuario` (RLS já libera) e mostram coluna "Dono" (email do profile).
- KPIs do Overview passam a refletir o sistema todo quando admin.

**Nova página `/dashboard/users`** (admin-only, protegida por guard):
- Lista profiles com email, data de cadastro, role atual, contagem de contas e workspaces.
- Botão para promover/rebaixar (toggle role admin) via insert/delete em `user_roles`.
- Busca por email.
- KPIs: total de usuários, total de admins, novos nos últimos 30 dias.

**Rota** `/dashboard/users` adicionada em `App.tsx` dentro de `ProtectedRoute` + guard `AdminRoute`.

### 3. Confirmação necessária

Preciso que você me diga **qual email** deve ser promovido a admin automaticamente (provavelmente o que você usa para logar no CRM). Vou usá-lo na trigger.

### Arquivos

- **Novo**: `supabase/migrations/..._admin_roles.sql`
- **Novo**: `src/pages/dashboard/Users.tsx`
- **Novo**: `src/components/auth/AdminRoute.tsx`
- **Editar**: `src/hooks/useAuth.tsx`, `src/App.tsx`, `src/components/dashboard/AppSidebar.tsx`, `src/pages/dashboard/Accounts.tsx`, `src/pages/dashboard/Workspaces.tsx`, `src/pages/dashboard/Overview.tsx`

Me confirma o email admin e eu sigo com a implementação.