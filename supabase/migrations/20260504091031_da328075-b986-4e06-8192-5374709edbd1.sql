-- Catálogo de pacotes de créditos
create table public.credit_packs (
  id text primary key,
  name text not null,
  credits integer not null,
  price_cents integer not null,
  is_popular boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.credit_packs enable row level security;

create policy credit_packs_public_read on public.credit_packs
  for select
  to anon, authenticated
  using (is_active = true);

create policy credit_packs_admin_all on public.credit_packs
  for all
  to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

create or replace function public.set_credit_packs_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_credit_packs_updated_at
before update on public.credit_packs
for each row execute function public.set_credit_packs_updated_at();

-- Cobranças Pix geradas pelo AbacatePay
create table public.pix_charges (
  id uuid primary key default gen_random_uuid(),
  tx_id text unique not null,
  pack_id text not null references public.credit_packs(id),
  customer_name text not null,
  customer_email text not null,
  customer_whatsapp text,
  amount_cents integer not null,
  status text not null default 'pending',
  license_id uuid references public.app_licenses(id),
  raw_payload jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pix_charges enable row level security;

create policy pix_charges_admin_read on public.pix_charges
  for select
  to authenticated
  using (public.has_role(auth.uid(),'admin'));

create or replace function public.set_pix_charges_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_pix_charges_updated_at
before update on public.pix_charges
for each row execute function public.set_pix_charges_updated_at();

create index idx_pix_charges_email on public.pix_charges(customer_email);
create index idx_pix_charges_status on public.pix_charges(status);

-- Seed dos pacotes iniciais
insert into public.credit_packs (id, name, credits, price_cents, is_popular, display_order) values
  ('starter','Starter',100,4700,false,1),
  ('pro','Pro',500,19700,true,2),
  ('power','Power',1000,34700,false,3),
  ('mega','Mega',2500,74700,false,4);
