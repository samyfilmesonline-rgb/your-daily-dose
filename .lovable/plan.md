## Objetivo

Alinhar o painel do parceiro 100% com o schema real (`farm_bots`, `partner_credit_packs`, `partner_credit_orders`) e com o fluxo onde o backend (webhook + RPC `assign_bot_to_order` + worker Python + `release_bot`) é o único responsável por atribuir bots e mudar status sensíveis. O frontend só lê, exibe em tempo real e faz CRUD do que é seguro.

## Mudanças

### 1. Migração — RLS de parceiro em `farm_bots`

Hoje só admin consegue ler/escrever em `farm_bots` (policy `fb_admin_all`). Parceiro logado não vê os próprios bots. Adicionar policies seguras:

- `SELECT` quando `partner_id = auth.uid()` (parceiro vê apenas os bots dele).
- `INSERT` quando `partner_id = auth.uid() AND is_active_partner()`.
- `UPDATE` quando `partner_id = auth.uid()`, mas com `WITH CHECK` que **bloqueia** alterações em `status`, `current_order_id`, `last_heartbeat_at`, `partner_id` (esses só o worker/admin via service role mexem). Parceiro só altera `nickname`, `email_lovable`, `senha_lovable`, `notes` e pode alternar entre `idle` e `disabled` (ativar/desativar).
- `DELETE` quando `partner_id = auth.uid()`.

Trigger `BEFORE UPDATE` valida que se `auth.role() = 'authenticated'` e não admin, mudanças de `status` só são permitidas entre `idle` ↔ `disabled` (busca/offline são exclusivas do worker).

Criar **view segura** `farm_bots_partner_view` (ou ajustar a existente) que esconde `senha_lovable` no SELECT — parceiro nunca lê a senha em texto puro.

### 2. Reorganizar sidebar e páginas

Hoje a aba `Bots de Farm` mistura bots + pedidos + pacotes em `/dashboard/bots`. Separar em três páginas dedicadas:

- `/dashboard/bots` — só bots (CRUD + status + heartbeat).
- `/dashboard/pedidos` — pedidos com filtros e badges.
- `/dashboard/pacotes` — CRUD dos `partner_credit_packs`.

Atualizar `src/lib/sidebar-tabs.ts` adicionando `pedidos` e `pacotes` (visibility `adminOrActivePartner`), atualizar `App.tsx` com as rotas, criar `src/pages/dashboard/Pedidos.tsx` e `src/pages/dashboard/Pacotes.tsx` reusando o que já existia em `Bots.tsx`.

### 3. Página Bots (`src/pages/dashboard/Bots.tsx`)

- Trocar `from("farm_bots_partner_view")` para a view sem senha quando ler, ou para `farm_bots` direto (RLS cuida).
- Adicionar **CRUD individual**:
  - Botão "Novo bot" → dialog com `email_lovable`, `senha_lovable`, `nickname`, `notes`.
  - Botão "Editar" por bot → dialog com `nickname`, `email_lovable`, `notes` e seção separada "Alterar senha" (campo `password` vazio; só envia update de senha se preenchido). Senha nunca é exibida.
  - Switch "Ativo" → alterna `status` entre `idle` e `disabled` (validado no trigger).
  - Botão "Excluir" com confirmação.
- Cards de status visual com mapping `idle/busy/offline/disabled` (cores e label PT-BR).
- Indicador de heartbeat: `last_heartbeat_at` calculado em segundos → "online (há 12s)" se < 60s, "sem sinal recente" se > 5min.
- Banner de alerta quando `bots.length === 0` ou quando `idle === 0 && busy === 0` ou nenhum heartbeat recente.
- **Remover** desta página as abas de pedidos e pacotes.
- Manter Realtime em `farm_bots` filtrado por `partner_id`.

### 4. Página Pedidos (`src/pages/dashboard/Pedidos.tsx`, nova)

- Listar `partner_credit_orders` do parceiro (RLS já cobre).
- Filtros por status (chips: pending, paid, queued, processing, delivered, failed, expired, refunded) + busca por cliente/email.
- Tabela com: cliente (nome + email + whatsapp), pacote (`credits cr · BRL`), `target_workspace`, status badge colorido, bot atribuído (join client-side com `farm_bots` por `assigned_bot_id` mostrando `nickname` ou `email_lovable`), `created_at`, `paid_at`, `delivered_at`.
- Linha expandível ou drawer mostrando: `failed_reason` quando `failed`, QR/copia-e-cola quando `pending` (caso o parceiro queira reenviar para o cliente), `tx_id`, `pix_expires_at`.
- Alertas no topo: contagem de pedidos `queued` ("aguardando bot"), `processing` ("em processamento"), `failed` nas últimas 24h.
- Realtime em `partner_credit_orders` filtrado por `partner_id`.
- **Sem nenhuma chamada** a `release_bot` ou `assign_bot_to_order`. Sem update de `status` ou `assigned_bot_id` no client.

### 5. Página Pacotes (`src/pages/dashboard/Pacotes.tsx`, nova)

Mover o `PacksManager` que hoje está embutido em `Bots.tsx` para página própria. CRUD já existente, com validação `credits > 0` e `price_cents > 0`, ordenação por `display_order`, switch `is_active`, preço em BRL.

### 6. Checkout `/comprar/:partnerId` (`src/pages/ComprarParceiro.tsx`)

- Manter o fluxo Pix existente via `partner-shop-create-pix` e `partner-shop-check-status`.
- **Adicionar Realtime** em `partner_credit_orders` filtrado por `id=eq.{orderId}` enquanto o usuário está na tela do QR. Quando `status` mudar para `paid`/`queued`/`processing`/`delivered`, avançar para a tela de sucesso sem depender só do polling de 4s. Manter o polling como fallback.
- Mostrar progresso visual: "Pagamento confirmado" → "Bot atribuído" → "Entregando créditos" → "Concluído", baseado em `status`/`assigned_bot_id`/`delivered_at`.

### 7. Limpeza

- Remover qualquer código que faça update de `assigned_bot_id`, `status` (em orders) ou `current_order_id` no frontend (não há nada hoje, mas reforçar com comentário em `Bots.tsx`/`Pedidos.tsx`).
- Confirmar que nenhum lugar do client usa `service_role` (já está OK; só `VITE_SUPABASE_PUBLISHABLE_KEY`).

## Detalhes técnicos

- O trigger de proteção em `farm_bots` será `BEFORE UPDATE` em PL/pgSQL, similar ao `app_licenses_guard_authenticated_updates` já existente. Quando `auth.role() = 'authenticated'` e o usuário **não** é admin: bloqueia mudança de `current_order_id`, `last_heartbeat_at`, `partner_id`; e só permite `status` se `OLD.status` e `NEW.status` forem ambos do conjunto `{idle, disabled}`.
- A view sem senha:

```sql
create or replace view public.farm_bots_partner_view as
select id, partner_id, email_lovable, nickname, status,
       current_order_id, last_heartbeat_at, notes,
       created_at, updated_at
from public.farm_bots;
```

E `grant select on public.farm_bots_partner_view to authenticated;` (a view herda RLS do select da tabela).

- Realtime: `supabase.channel(...).on("postgres_changes", { event: "*", schema: "public", table: "...", filter: "..." }, ...)` — já é o padrão usado em `Bots.tsx`.

## Validação

1. Logar como parceiro: ver apenas os próprios bots; tentar mudar `status` para `busy` direto via client → erro do trigger.
2. Criar/editar bot: senha não aparece após salvar; alterar senha só com campo preenchido funciona.
3. Página Pedidos: filtros funcionam; bot atribuído aparece; `failed_reason` visível em pedidos `failed`.
4. Checkout: ao pagar Pix em outra aba, a tela do QR avança sozinha via Realtime em < 2s.
5. Verificar que nenhum bundle JS contém `service_role`.