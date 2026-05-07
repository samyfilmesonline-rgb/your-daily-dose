## Visão geral

Criar uma página pública `/comprar/:partnerId` no estilo da imagem para clientes finais comprarem créditos Lovable de um parceiro específico, integrar com AbacatePay/Pix, e adicionar gestão de "Bots de Farm" (contas Lovable injetoras) tanto no admin (em massa, atribuídas por parceiro) quanto no painel do parceiro (visão dos seus bots ativos).

---

## 1. Banco de dados (nova migration)

### Tabela `partner_credit_packs`
Pacotes que cada parceiro define para vender ao cliente final.
- `partner_id` (uuid → parceiros.user_id)
- `name`, `credits`, `price_cents`, `original_price_cents` (para riscado/desconto), `badge_label`
- `is_active`, `display_order`
- RLS: parceiro CRUD nos próprios; leitura pública (`anon`+`authenticated`) somente quando `is_active=true`.

### Tabela `farm_bots`
Contas Lovable (bots) cadastradas pelo admin e atribuídas a um parceiro.
- `partner_id` (uuid → parceiros.user_id)
- `email_lovable`, `senha_lovable` (texto; já é o padrão do projeto em `contas_lovable`)
- `nickname` (opcional, ex: "Bot 01")
- `status`: enum `idle | busy | offline | disabled` (default `idle`)
- `current_order_id` (uuid → partner_credit_orders, nullable)
- `last_heartbeat_at`, `notes`
- RLS:
  - admin: ALL
  - parceiro: SELECT apenas dos próprios (`partner_id = auth.uid()`); **sem ver `senha_lovable`** → criamos VIEW `farm_bots_partner_view` (sem senha) e revogamos SELECT direto da senha via policy de coluna ou expondo só via view.

### Tabela `partner_credit_orders`
Pedido do cliente final.
- `partner_id`, `pack_id` (→ partner_credit_packs)
- `customer_name`, `customer_email`, `customer_whatsapp`, `customer_tax_id`
- `target_workspace` (texto opcional; o cliente informa o nome/URL do workspace dele para o admin/bot saber onde injetar)
- `credits`, `amount_cents`
- `status`: `pending | paid | queued | processing | delivered | failed | refunded | expired`
- `tx_id`, `pix_qrcode`, `pix_copy_paste`, `pix_expires_at` (gateway AbacatePay)
- `paid_at`, `assigned_bot_id`, `assigned_at`, `delivered_at`, `failed_reason`, `raw_payload`
- RLS:
  - admin: ALL
  - parceiro: SELECT/UPDATE (status limitado) dos próprios
  - INSERT: somente via edge function (service role) — bloquear public

### Função SQL `assign_bot_to_order(_order_id uuid)`
SECURITY DEFINER. Pega o pedido, encontra primeiro `farm_bots` `idle` do parceiro e marca `busy` + grava `assigned_bot_id` + status do pedido vai para `processing`. Se não tiver bot livre, marca pedido como `queued`. Retorna o bot escolhido (ou null).

### Função SQL `release_bot(_bot_id uuid, _order_id uuid, _success boolean, _reason text)`
Volta o bot para `idle` e marca o pedido como `delivered` ou `failed`. Em seguida, chama `assign_next_queued_order(partner_id)` para puxar da fila automaticamente.

### Função `assign_next_queued_order(_partner_id uuid)`
Procura próximo pedido `queued` do parceiro e tenta assign.

### Realtime
Habilitar replica identity FULL e adicionar `partner_credit_orders` e `farm_bots` à publicação `supabase_realtime` para o painel do parceiro atualizar em tempo real (e para o farm py escutar).

---

## 2. Edge functions

### `partner-shop-create-pix` (público, sem JWT)
Body: `{ partnerId, packId, customerName, customerEmail, customerWhatsapp, customerTaxId, targetWorkspace }`
- Valida com Zod, busca `partner_credit_packs` (ativo + pertence ao parceiro)
- Cria cobrança Pix no AbacatePay (reaproveitar `_shared/abacate.ts`)
- Insere `partner_credit_orders` (status `pending`) com `tx_id`
- Retorna `{ orderId, txId, qrCodeImage, copiaECola, expiresAt, amountCents }`

### `partner-shop-check-status` (público)
Body: `{ orderId }` → retorna status da ordem (polling do front igual à `abacatepay-check-status`).

### `abacatepay-webhook` (existente — estender)
Hoje trata `pix_charges` (loja interna). Estender para também marcar `partner_credit_orders` como `paid`, gravar `paid_at`, e chamar `assign_bot_to_order`. Roteamento por busca de `tx_id` em ambas tabelas.

### `admin-create-farm-bots` (auth + admin)
Body: `{ partnerId, bots: [{ email, password, nickname? }] }` — insert em massa (até 200 por chamada), com validação Zod. Retorna sucessos/falhas por linha.

---

## 3. Frontend

### `/comprar/:partnerId` (rota pública nova em `App.tsx`)
Página `src/pages/ComprarParceiro.tsx` no estilo da imagem (tema matrix verde):
- Header com nome do parceiro e descrição
- Cards de stats (saldo da conta, total entregue, taxa de sucesso) — pode mostrar "200 créditos / pedido", "R$ por crédito", etc.
- Tabs (mock visual inicial): **Pedido** ativo
- Bloco "Requisitos importantes" (avisos de plano FREE, limite por workspace 24h)
- Card grande "200 créditos por R$27" com:
  - lista de benefícios à esquerda
  - card de pacote com preço grande à direita
  - Botão "Comprar 200 créditos – R$27"
- Dialog "Confirmar pedido" igual à 2ª imagem (resumo de plano, custo, saldo após)
- Após confirmar: dialog Pix (QR + copia-e-cola), polling em `partner-shop-check-status`
- Quando `paid` → tela de sucesso com instruções: "envie o convite para `email-bot@...` como Owner do seu workspace" (e-mail do bot atribuído fica visível só após pagamento)
- Se nenhum pacote ativo do parceiro → mensagem amigável

### Painel do parceiro: nova aba "Bots"
- Registrar em `src/lib/sidebar-tabs.ts` chave `bots` (visibilidade `adminOrActivePartner`)
- Rota `/dashboard/bots` em `App.tsx` → `src/pages/dashboard/Bots.tsx`
- Conteúdo:
  - Header com contador grande "X bots ativos / Y total"
  - Grid de cards de bot mostrando: nickname, e-mail (mascarado parcialmente), status (idle/busy/offline), pedido atual (se busy), último heartbeat
  - Tabela de **pedidos recentes do parceiro** (clientes que compraram), com status, valor, bot atribuído
  - Aba "Meus pacotes" para CRUD em `partner_credit_packs` (ativar/desativar, editar preço/quantidade)

### Painel admin: gestão de bots em massa
- Em `src/pages/dashboard/Partners.tsx`, adicionar botão "Bots" por linha → abre dialog `PartnerBotsDialog`
- Dialog com:
  - Tabela de bots já atribuídos ao parceiro (editar/remover/desativar)
  - Textarea "Adicionar em massa" aceitando formato `email:senha` ou `email,senha,nickname` por linha (paste do gerenciador), botão "Importar N bots" → chama `admin-create-farm-bots`
  - Mostrar resultados (sucesso/duplicado/erro) por linha
- Adicionar coluna "Bots" na tabela de parceiros com contador (ativos/total)

---

## 4. Integração com o farm py
O sistema py do usuário continua como hoje — passa a:
1. Escutar realtime em `partner_credit_orders` por mudanças `status=processing` cujo `assigned_bot_id` corresponda às credenciais que ele controla, **ou** fazer polling em `select * from partner_credit_orders where status='processing'`.
2. Ao terminar, chamar uma RPC `release_bot(bot_id, order_id, success, reason)` (já criada).

Isso fica documentado em `docs/farm-bots-integration.md` com exemplo SQL/JS, mas nenhum código py é gerado.

---

## 5. Memória e regras
- Atualizar `mem://index.md` adicionando aba `bots` no catálogo (já automático pelo `sidebar-tabs.ts`).
- Criar `mem://features/farm-bots.md` documentando: bots pertencem ao parceiro, senha nunca exposta no front do parceiro, atribuição automática + fila, integração via realtime.

---

## Ordem de execução
1. Migration (tabelas + RLS + funções + realtime)
2. Edge functions (`partner-shop-create-pix`, `partner-shop-check-status`, extensão do webhook, `admin-create-farm-bots`)
3. Front: rota pública `/comprar/:partnerId` + dialogs
4. Front: aba "Bots" do parceiro (lista + pedidos + pacotes)
5. Front: dialog de bots em massa no admin (Partners.tsx)
6. Doc de integração py + memória
