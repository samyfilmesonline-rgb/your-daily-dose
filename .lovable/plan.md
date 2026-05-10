## Aba "Checkout" no painel admin

Nova aba unificada para o admin acompanhar todos os pagamentos da plataforma (parceiros + licenças/loja), com base para remarketing futuro via WhatsApp/webhook.

### 1. Banco de dados

**Nova tabela `payment_events`** (timeline imutável de eventos de pagamento, alimentada por triggers em `partner_credit_orders` e `pix_charges`):

Campos: `id`, `source` (`partner_order` | `pix_charge`), `source_id`, `event_type` (`pix_generated`, `paid`, `failed`, `canceled`, `expired`, `refunded`, `delivered`), `customer_email`, `customer_name`, `customer_whatsapp`, `partner_id`, `amount_cents`, `credits`, `status_before`, `status_after`, `metadata` (jsonb), `created_at`.

- Índices em `customer_email`, `customer_whatsapp`, `partner_id`, `created_at`, `event_type`.
- RLS: só admin lê/escreve. Triggers usam `SECURITY DEFINER`.
- 2 triggers `AFTER INSERT OR UPDATE`: uma em `partner_credit_orders`, outra em `pix_charges`. Detectam mudança de status e gravam o evento correspondente.
- Backfill: insert inicial dos pedidos/charges existentes como evento "snapshot" para a tela já mostrar histórico.

### 2. Edge function `admin-checkout-list`

Lista unificada paginada que junta `partner_credit_orders` + `pix_charges` numa estrutura comum:

```text
{ id, source, status, customer_name, customer_email, customer_whatsapp,
  partner_id, partner_name, amount_cents, credits, created_at, paid_at,
  pix_expires_at, last_event_type, last_event_at, raw }
```

Filtros aceitos:
- `source`: all | partner | pix
- `status`: pending, pix_generated, paid, failed, canceled, expired, refunded, delivered
- `from`, `to` (datas)
- `q` (busca em email, nome, whatsapp)
- `page`, `pageSize`

Usa service role; valida JWT + `has_role(admin)` no início. Retorna também totais agregados (faturado, pago, pendente, falho) do filtro atual.

### 3. Frontend

**Nova rota** `/dashboard/checkout` registrada em `App.tsx` dentro de `AdminRoute`.

**Nova aba** em `src/lib/sidebar-tabs.ts`:
```text
{ key: "checkout", title: "Checkout", url: "/dashboard/checkout",
  icon: Receipt, defaultVisibility: "adminOnly" }
```

**Nova página** `src/pages/dashboard/Checkout.tsx`:
- Cards no topo: Faturado, Pago, Pendente/PIX gerado, Falho/Cancelado (do filtro atual).
- Barra de filtros: select de origem (Todos/Parceiros/Loja), select de status, range de datas, input de busca.
- Tabela com colunas: Data · Cliente (nome + email + whatsapp) · Origem · Parceiro · Valor · Créditos · Status (badge colorido) · Ações.
- Ações por linha: botão "Detalhes" abre modal com timeline de `payment_events` + payload bruto + botões "copiar email" / "copiar whatsapp".
- Paginação simples (Próx/Anterior).
- Sem CSV nem tags por enquanto (decisão do usuário).

### 4. Detalhes técnicos relevantes

- A tabela `payment_events` já é o ponto de integração futuro com webhook: basta uma function `on-payment-event` (não criada agora) que escute novos rows e dispare WhatsApp.
- Status normalizados na UI para um vocabulário só, mesmo vindos de tabelas diferentes:
  - `pix_charges.status` (pending, paid, …) → mapeado.
  - `partner_credit_orders.status` (pending, paid, queued, processing, delivered, failed, refunded, expired, canceled) → mapeado.
- Telefone/whatsapp formatado quando disponível; "—" quando não.
- Página segue tema Matrix (mesma estilização das outras tabelas admin).

### Fora do escopo (decidido)
- Exportar CSV.
- Tags/notas de lead.
- Disparo de WhatsApp em si (só preparamos a base de eventos).
