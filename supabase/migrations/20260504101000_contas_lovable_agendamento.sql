-- Agenda de farm automatico por conta Lovable.
-- Mantem o frontend Lovable e o app desktop alinhados com meta, workspace padrao e proxima execucao.

alter table public.contas_lovable
    add column if not exists farm_auto_ativo boolean not null default false,
    add column if not exists meta_creditos_total numeric not null default 200,
    add column if not exists creditos_farmados_total numeric not null default 0,
    add column if not exists ultimo_farm_sucesso_em timestamptz,
    add column if not exists proximo_farm_em timestamptz,
    add column if not exists ultimo_erro_farm text,
    add column if not exists workspace_padrao text;

create index if not exists idx_contas_lovable_auto_due
    on public.contas_lovable (id_do_usuario, farm_auto_ativo, proximo_farm_em)
    where farm_auto_ativo = true;

create index if not exists idx_contas_lovable_workspace_padrao
    on public.contas_lovable (id_do_usuario, workspace_padrao)
    where workspace_padrao is not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'contas_lovable_meta_creditos_nonnegative'
          and conrelid = 'public.contas_lovable'::regclass
    ) then
        alter table public.contas_lovable
            add constraint contas_lovable_meta_creditos_nonnegative
            check (meta_creditos_total >= 0);
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'contas_lovable_creditos_farmados_nonnegative'
          and conrelid = 'public.contas_lovable'::regclass
    ) then
        alter table public.contas_lovable
            add constraint contas_lovable_creditos_farmados_nonnegative
            check (creditos_farmados_total >= 0);
    end if;
end $$;

notify pgrst, 'reload schema';
