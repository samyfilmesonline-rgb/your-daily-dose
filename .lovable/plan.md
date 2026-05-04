## Objetivo

1. **Esconder a aba "Licenças"** do sidebar para usuários comuns (não-admin e não-parceiro-ativo).
2. Dar ao admin um **painel centralizado de permissões de abas** onde ele libera/bloqueia, por usuário, qualquer item do sidebar — incluindo abas futuras, sem precisar alterar regras de RLS.
3. Gravar na memória do projeto a regra: "admin pode ativar qualquer aba do sidebar para qualquer usuário, e essa capacidade deve cobrir abas novas automaticamente".

## Modelo

### Tabela nova: `public.tab_permissions`
Permissões explícitas por usuário e por chave de aba (`tab_key`).

| coluna       | tipo        | obs                              |
|--------------|-------------|----------------------------------|
| id           | uuid pk     | default gen_random_uuid()        |
| user_id      | uuid        | FK lógico para auth.users        |
| tab_key      | text        | ex.: "licencas", "accounts"      |
| granted_by   | uuid        | admin que liberou                |
| created_at   | timestamptz | default now()                    |
| UNIQUE(user_id, tab_key)                                       |

RLS:
- SELECT: o próprio usuário vê suas permissões; admin vê todas.
- INSERT/UPDATE/DELETE: somente admin (`has_role(auth.uid(),'admin')`).

### Função helper SQL
`public.has_tab_access(_user_id uuid, _tab text) returns boolean` — `SECURITY DEFINER`, retorna true se admin OU se existir linha em `tab_permissions`. Útil para uso futuro em RLS de outras tabelas, e também consultado pelo frontend.

## Frontend

### 1. Catálogo único de abas (`src/lib/sidebar-tabs.ts`)
Define todas as abas do sidebar com `key`, título, url, ícone e `defaultVisibility`:
- `overview` — sempre visível para autenticado
- `accounts` — `partnerOrAdmin` (default igual hoje, mas controlável)
- `workspaces` — `partnerOrAdmin`
- `licencas` — **`adminOrActivePartner`** (NÃO mais visível para usuário comum)
- `parceiros` — `adminOnly`
- `users` — `adminOnly`

Este arquivo é a fonte da verdade. Adicionar uma aba nova = adicionar uma linha aqui; ela já entra automaticamente no painel de permissões do admin.

### 2. `useAuth` ganha `tabPermissions: Set<string>`
Carregado em paralelo com `parceiro` via `select tab_key from tab_permissions where user_id = auth.uid()`. Atualiza no login e quando admin altera (via `refreshTabPermissions`).

### 3. `AppSidebar.tsx`
Renderiza a partir do catálogo. Para cada aba, mostra se:
`isAdmin || tabPermissions.has(tab.key) || matchesDefaultVisibility(tab, { isAdmin, parceiro })`

Resultado prático:
- Usuário comum vê só "Visão geral".
- Parceiro ativo vê o conjunto padrão de parceiro (Clientes, Workspaces, Licenças).
- Admin vê tudo.
- Qualquer usuário ganha abas extras se o admin liberar via painel.

### 4. Guards de rota
- `ActivePartnerRoute` continua igual para `/licencas`, mas ganha bypass: também aceita usuários com permissão explícita `licencas` em `tab_permissions`.
- Criar `TabRoute key="..."` genérico (opcional, próximo passo) — por ora aplicamos só onde já existem guards.

### 5. Novo painel: `/dashboard/users` ganha coluna "Permissões"
Em cada linha de usuário, botão "Permissões" abre um `Dialog` com checkboxes para cada aba do catálogo (exceto `overview`). Toggle insere/deleta linhas em `tab_permissions`. Admin vê e edita ali mesmo.

## Migração SQL

```sql
create table public.tab_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tab_key text not null,
  granted_by uuid,
  created_at timestamptz not null default now(),
  unique (user_id, tab_key)
);
alter table public.tab_permissions enable row level security;

create policy "tab_perm_select_self_or_admin" on public.tab_permissions
for select to authenticated
using (auth.uid() = user_id or has_role(auth.uid(),'admin'));

create policy "tab_perm_admin_write" on public.tab_permissions
for all to authenticated
using (has_role(auth.uid(),'admin'))
with check (has_role(auth.uid(),'admin'));

create or replace function public.has_tab_access(_user_id uuid, _tab text)
returns boolean language sql stable security definer set search_path=public as $$
  select has_role(_user_id,'admin')
      or exists (select 1 from public.tab_permissions
                  where user_id = _user_id and tab_key = _tab);
$$;
```

## Memória do projeto

Gravar duas regras:

- **Core (`mem://index.md`)**: "Admin tem o poder de ativar/desativar qualquer aba do sidebar para qualquer usuário; ao adicionar uma aba nova, registrá-la em `src/lib/sidebar-tabs.ts` para que ela apareça automaticamente no painel de permissões do admin."
- **Memória detalhada (`mem://features/tab-permissions.md`)**: descreve a tabela `tab_permissions`, a função `has_tab_access`, o catálogo `sidebar-tabs.ts`, o painel em `/dashboard/users` e a regra de visibilidade default por aba.

## Resumo de comportamento após mudanças

| Tipo de usuário | Vê "Licenças" no sidebar? | Acessa `/dashboard/licencas`? |
|-----------------|---------------------------|-------------------------------|
| Usuário comum (sem permissão) | Não | Não (tela "cadastro inativo") |
| Usuário comum com permissão `licencas` liberada pelo admin | Sim | Sim |
| Parceiro ativo  | Sim | Sim |
| Admin           | Sim | Sim |