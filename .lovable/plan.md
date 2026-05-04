
## Objetivo

Criar uma landing page de vendas pública em `/vendas` (e também como rota raiz `/` opcional) com o mesmo visual da Matrix Farms (verde neon, MatrixRain, glitch text), vendendo **pacotes de créditos Lovable**. Pagamento via **Pix usando AbacatePay**. Após pagamento confirmado, uma licença é criada automaticamente em `app_licenses` vinculada ao email do comprador.

## Pacotes de créditos (sugestão inicial — editáveis no código)

| Pacote | Créditos | Preço (R$) | Destaque |
|--------|----------|------------|----------|
| Starter | 100 | 47,00 | — |
| Pro | 500 | 197,00 | Mais popular |
| Power | 1000 | 347,00 | Melhor custo/crédito |
| Mega | 2500 | 747,00 | — |

Os valores ficam em uma constante `CREDIT_PACKS` em `src/lib/credit-packs.ts` para ajuste fácil.

## Estrutura visual (réplica Matrix Farms)

1. **Hero** — `MATRIX CREDITS` em glitch text + subtítulo "Compre créditos Lovable sem assinatura mensal" + CTA "QUERO MEUS CRÉDITOS".
2. **Como funciona** — 3 passos (Escolha o pacote → Pague no Pix → Receba acesso instantâneo).
3. **Vídeo** — placeholder de VSL (player simples; URL configurável).
4. **Depoimentos** — Marquee horizontal com cards (mockados).
5. **Pricing** — Cards dos 4 pacotes, com badge "POPULAR" no Pro, botão "COMPRAR AGORA".
6. **FAQ** — Accordion com 5 perguntas (segurança, garantia, prazo de entrega, etc.).
7. **Footer** — links institucionais simples + login.

Tema: tudo no verde neon Matrix usando o design system atual (já tem `--primary` configurável). Vou injetar os tokens HSL Matrix (`120 100% 45%`) num CSS scoped à página `/vendas` para não alterar o tema do dashboard.

Componentes novos reutilizáveis:
- `src/components/landing/MatrixRain.tsx` — canvas com chuva matrix (FPS throttled).
- `src/components/landing/GlitchText.tsx` — efeito glitch leve.
- `src/components/landing/Marquee.tsx` — depoimentos rolando.
- `src/components/landing/PricingCard.tsx` — card de pacote.

## Fluxo de pagamento (AbacatePay + Pix)

```text
Cliente clica COMPRAR
   ↓
Modal CheckoutDialog: nome + email + WhatsApp
   ↓
POST → edge function `abacatepay-create-pix`
   ↓
AbacatePay retorna { qrCode, copiaECola, txId, amount }
   ↓
Modal exibe QR Code + botão "Copiar Pix"
   ↓
Frontend faz polling (5s) em `abacatepay-check-status?txId=...`
   ↓
Quando status = PAID:
   - edge function cria registro em `app_licenses`
     (customer_email, customer_name, plan_code='credits_<qty>',
      plan_name='Pacote N créditos', max_machines=1, status='active',
      notes='Pagamento Pix Abacate <txId>')
   - Frontend mostra tela de sucesso com instruções de acesso
```

## Edge Functions

1. **`abacatepay-create-pix`** (público, sem JWT)
   - Input validado com Zod: `{ packId, customerName, customerEmail, customerWhatsapp }`
   - Busca o pacote em uma tabela `credit_packs` (ou usa constante shared) e cria cobrança na API AbacatePay.
   - Salva uma linha em nova tabela `pix_charges` com status `pending`.
   - Retorna `{ txId, qrCode, copiaECola, amount, expiresAt }`.

2. **`abacatepay-check-status`** (público)
   - Input: `{ txId }`.
   - Consulta status da cobrança na API Abacate.
   - Se PAID e ainda não processado → cria `app_licenses` e marca `pix_charges.status='paid'`.
   - Retorna `{ status: 'pending' | 'paid' | 'expired', licenseCreated: bool }`.

3. **`abacatepay-webhook`** (público, sem JWT)
   - Endpoint que receberá callbacks da AbacatePay (configurar URL no painel deles).
   - Mesma lógica de criação de licença, idempotente por `txId`.

Secret necessário: **`ABACATEPAY_API_KEY`** (será solicitado depois que o plano for aprovado).

## Mudanças no banco

Migration nova:

```sql
-- Tabela de pacotes de créditos (admin pode editar via SQL ou futuro CRUD)
create table public.credit_packs (
  id text primary key,            -- 'starter','pro','power','mega'
  name text not null,
  credits integer not null,
  price_cents integer not null,
  is_popular boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.credit_packs enable row level security;
create policy credit_packs_public_read on public.credit_packs
  for select to anon, authenticated using (is_active = true);
create policy credit_packs_admin_write on public.credit_packs
  for all to authenticated
  using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));

-- Cobranças Pix
create table public.pix_charges (
  id uuid primary key default gen_random_uuid(),
  tx_id text unique not null,        -- id retornado pela Abacate
  pack_id text not null references public.credit_packs(id),
  customer_name text not null,
  customer_email text not null,
  customer_whatsapp text,
  amount_cents integer not null,
  status text not null default 'pending', -- pending | paid | expired | failed
  license_id uuid references public.app_licenses(id),
  raw_payload jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pix_charges enable row level security;
-- nenhuma policy pública: só edge functions (service role) escrevem/leem
create policy pix_charges_admin_read on public.pix_charges
  for select to authenticated using (has_role(auth.uid(),'admin'));

-- Seed dos pacotes
insert into public.credit_packs (id,name,credits,price_cents,is_popular,display_order) values
  ('starter','Starter',100,4700,false,1),
  ('pro','Pro',500,19700,true,2),
  ('power','Power',1000,34700,false,3),
  ('mega','Mega',2500,74700,false,4);
```

## Mudanças de rotas (`src/App.tsx`)

```tsx
<Route path="/vendas" element={<Vendas />} />
```

(Não vou mexer na home `/` automaticamente; se quiser que a landing seja a raiz, é só trocar depois.)

## Arquivos a criar

- `src/pages/Vendas.tsx` — página principal.
- `src/components/landing/MatrixRain.tsx`
- `src/components/landing/GlitchText.tsx`
- `src/components/landing/Marquee.tsx`
- `src/components/landing/PricingCard.tsx`
- `src/components/landing/CheckoutPixDialog.tsx` — modal com formulário + QR Code + polling.
- `src/lib/credit-packs.ts` — tipos compartilhados.
- `supabase/functions/abacatepay-create-pix/index.ts`
- `supabase/functions/abacatepay-check-status/index.ts`
- `supabase/functions/abacatepay-webhook/index.ts`
- Migration SQL (acima).

## Arquivos a editar

- `src/App.tsx` — registrar rota `/vendas`.
- `supabase/config.toml` — declarar as 3 edge functions com `verify_jwt = false`.

## Pontos de atenção

- **Secret AbacatePay**: depois que aprovar este plano, vou pedir a `ABACATEPAY_API_KEY` antes de implementar as edge functions.
- **Webhook URL**: depois do deploy, vou te passar a URL para colar no painel da AbacatePay.
- **Licença vinculada por email**: como o comprador pode não ter conta ainda, a licença é criada com `customer_email` e `id_do_usuario = null`. Quando ele se cadastrar com o mesmo email, a RLS já permite que ele "reivindique" (update do `id_do_usuario`). Isso já está suportado pelo trigger `app_licenses_guard_authenticated_updates`.
- **Teste sem pagar de verdade**: a AbacatePay tem ambiente sandbox; vou usar a key sandbox primeiro.
