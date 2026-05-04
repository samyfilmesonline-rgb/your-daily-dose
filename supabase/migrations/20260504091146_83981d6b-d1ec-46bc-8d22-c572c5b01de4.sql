create or replace function public.set_credit_packs_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.set_pix_charges_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin new.updated_at = now(); return new; end;
$$;
