create table public.tab_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tab_key text not null,
  granted_by uuid,
  created_at timestamptz not null default now(),
  unique (user_id, tab_key)
);

alter table public.tab_permissions enable row level security;

create policy "tab_perm_select_self_or_admin"
on public.tab_permissions
for select
to authenticated
using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "tab_perm_admin_insert"
on public.tab_permissions
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "tab_perm_admin_update"
on public.tab_permissions
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "tab_perm_admin_delete"
on public.tab_permissions
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create index if not exists tab_permissions_user_id_idx on public.tab_permissions(user_id);

create or replace function public.has_tab_access(_user_id uuid, _tab text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'admin')
      or exists (
        select 1 from public.tab_permissions
        where user_id = _user_id and tab_key = _tab
      );
$$;