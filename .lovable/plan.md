
# Loja de Créditos no Gerenciador

Hoje a página `/vendas` é pública e cria uma `app_license` ao confirmar o Pix (cliente final compra licença). Já o **parceiro logado** no painel tem um limite próprio em `parceiros.limite_creditos` que define quanto pode farmar (visto no `QuotaBadge`). Falta uma loja **dentro do gerenciador** que aumente esse limite quando o parceiro compra créditos para si.

## Modelo conceitual

Quando um parceiro compra um pacote dentro do dashboard, ao confirmar o Pix:
- **Não** cria `app_license`.
- **Soma** os créditos comprados ao `parceiros.limite_creditos` do parceiro (ele passa a poder farmar mais).
- Registra a compra em `pix_charges` com vínculo ao usuário comprador para auditoria.

## Mudanças

### 1. Banco
- Adicionar coluna `pix_charges.partner_user_id uuid null` para distinguir compras feitas por parceiro logado (loja interna) das compras públicas do site `/vendas`.
- Adicionar índice `pix_charges (partner_user_id)`.
- Política RLS extra em `pix_charges`: parceiro pode ver as próprias compras (`partner_user_id = auth.uid()`).

### 2. Sidebar
- Adicionar aba **"Loja"** em `src/lib/sidebar-tabs.ts`:
  - `key: "loja"`, `url: "/dashboard/loja"`, ícone `ShoppingBag`, `defaultVisibility: "always"`, `alwaysOn: true` (todo parceiro logado vê).

### 3. Nova rota e página
- Rota `/dashboard/loja` em `src/App.tsx`.
- `src/pages/dashboard/Loja.tsx`:
  - Header no estilo Matrix (`GlitchText`, `cyber-grid`, fontes mono) consistente com o resto do dashboard.
  - Card de saldo atual: "Seus créditos: usados / limite" puxando do `useAuth().parceiro`.
  - Grid de `PricingCard` reutilizando `credit_packs` (`useQuery` igual ao `/vendas`).
  - Texto explicativo: "Os créditos comprados aqui vão direto para sua conta de farm."
  - Histórico de compras (lista compacta das últimas `pix_charges` com `partner_user_id = user.id`).

### 4. Novo dialog de checkout interno
- `src/components/dashboard/loja/CheckoutCreditsDialog.tsx` (variante do `CheckoutPixDialog`):
  - Não pede e-mail/nome (usa o do parceiro logado), só pede CPF/WhatsApp se ainda não cadastrados.
  - Chama nova edge function `loja-create-pix` (não a pública `abacatepay-create-pix`).
  - Polling de status por `loja-check-status`.
  - Ao confirmar pagamento: refetch do `parceiro` (mostra novo limite imediatamente) + toast "X créditos adicionados ao seu farm".

### 5. Edge functions
- **`loja-create-pix`** (`supabase/functions/loja-create-pix/index.ts`):
  - Requer JWT, identifica `auth.uid()`.
  - Valida que o usuário tem registro em `parceiros`.
  - Reusa `createPixCharge` de `_shared/abacate.ts`.
  - Insere `pix_charges` com `partner_user_id = auth.uid()` e marca `notes`/payload como compra interna.
- **`loja-check-status`**: igual ao `abacatepay-check-status` mas filtra por `partner_user_id`.
- **`abacatepay-webhook`** (modificar):
  - Quando o `pix_charges.partner_user_id` está preenchido → **NÃO** criar `app_license`. Em vez disso:
    - `update parceiros set limite_creditos = limite_creditos + pack.credits where user_id = partner_user_id`.
  - Quando `partner_user_id` é null → mantém comportamento atual (cria `app_license` para fluxo público de `/vendas`).
  - Idempotência preservada via `pix_charges.status = 'paid'`.

### 6. UX e estilo
- Toda a página Loja segue o tema Matrix (verde neon, `font-mono`, glow), idêntico ao restante do `/dashboard/*`.
- `PricingCard` é reaproveitado tal como está; texto secundário ajustado via prop opcional ou variante leve se necessário (pode ser feito sem alterar o componente, usando wrapper).

## Fora de escopo
- Refunds, alteração de planos pagos, gateway alternativo.
- Mudança no fluxo público `/vendas` (continua criando `app_license`).
- Painel de admin para reembolsar / estornar (pode vir depois).

## Resumo de arquivos
- **DB migration**: adicionar `partner_user_id` em `pix_charges` + RLS.
- **Novo**: `src/pages/dashboard/Loja.tsx`, `src/components/dashboard/loja/CheckoutCreditsDialog.tsx`, `supabase/functions/loja-create-pix/index.ts`, `supabase/functions/loja-check-status/index.ts`.
- **Modificado**: `src/App.tsx`, `src/lib/sidebar-tabs.ts`, `supabase/functions/abacatepay-webhook/index.ts`.
