-- Security rules for public.contas_lovable
-- Apply this migration in Supabase before exposing the app publicly.

alter table public.contas_lovable enable row level security;

revoke all on table public.contas_lovable from anon;
grant select, insert, update, delete on table public.contas_lovable to authenticated;

drop policy if exists "contas_lovable_select_own" on public.contas_lovable;
drop policy if exists "contas_lovable_insert_own" on public.contas_lovable;
drop policy if exists "contas_lovable_update_own" on public.contas_lovable;
drop policy if exists "contas_lovable_delete_own" on public.contas_lovable;

create policy "contas_lovable_select_own"
on public.contas_lovable
for select
to authenticated
using (auth.uid() = id_do_usuario);

create policy "contas_lovable_insert_own"
on public.contas_lovable
for insert
to authenticated
with check (auth.uid() = id_do_usuario);

create policy "contas_lovable_update_own"
on public.contas_lovable
for update
to authenticated
using (auth.uid() = id_do_usuario)
with check (auth.uid() = id_do_usuario);

create policy "contas_lovable_delete_own"
on public.contas_lovable
for delete
to authenticated
using (auth.uid() = id_do_usuario);
