
alter table public.partner_order_schedules
  add column if not exists multi_workspace_mode boolean not null default true,
  add column if not exists target_workspace text,
  add column if not exists credits_per_run integer,
  add column if not exists amount_cents_per_run integer;

alter table public.partner_order_schedules
  alter column bot_id drop not null,
  alter column price_cents_per_workspace drop not null;

create or replace function public.tg_validate_order_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.multi_workspace_mode then
    if new.price_cents_per_workspace is null or new.price_cents_per_workspace <= 0 then
      raise exception 'price_cents_per_workspace é obrigatório no modo multi-workspace';
    end if;
  else
    if new.target_workspace is null or length(trim(new.target_workspace)) = 0 then
      raise exception 'target_workspace é obrigatório no modo single-workspace';
    end if;
    if new.credits_per_run is null or new.credits_per_run <= 0 then
      raise exception 'credits_per_run é obrigatório no modo single-workspace';
    end if;
    if new.amount_cents_per_run is null or new.amount_cents_per_run < 0 then
      raise exception 'amount_cents_per_run é obrigatório no modo single-workspace';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tg_validate_order_schedule on public.partner_order_schedules;
create trigger tg_validate_order_schedule
  before insert or update on public.partner_order_schedules
  for each row execute function public.tg_validate_order_schedule();
