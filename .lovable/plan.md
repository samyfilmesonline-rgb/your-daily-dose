# Pedido travado em "Aguardando pagamento"

## Diagnóstico

Verifiquei direto na API da AbacatePay os 3 pedidos `pending` no banco — todos retornam `status: "PENDING"` no gateway. O nosso código já faz polling correto a cada chamada de `partner-shop-check-status`: se o gateway disser PAID, marca como pago. Ou seja, o problema não é bug nosso — o gateway simplesmente não recebeu/processou a confirmação do banco do cliente para o pedido `28327826…` (R$ 1,00, endersonaguiartrader@gmail.com).

Casos típicos: pagamento feito após `expiresAt`, banco do cliente atrasou liquidação, ou Pix caiu em outra cobrança. Como você tem o comprovante, precisamos de duas coisas: (1) ferramenta para o cliente forçar uma reverificação imediata, e (2) caminho admin para marcar manualmente como pago anexando o comprovante.

## O que vou construir

### 1. Botão "Já paguei, verificar agora" (cliente final, em `ComprarParceiro.tsx`)

- No card do Pix pendente, abaixo do QR code e do "Aguardando pagamento", adicionar botão `Já paguei — verificar agora`.
- Ao clicar: chama `partner-shop-check-status` imediatamente (fora do intervalo de polling), mostra loader 2-3s.
- Se voltar `paid/queued/...`: avança a UI normalmente.
- Se continuar `pending`: toast amigável — "Ainda não recebemos a confirmação do banco. Pode levar até alguns minutos. Se já se passaram mais de 10 minutos, fale com o suporte e tenha o comprovante em mãos."
- Rate-limit no frontend: bloqueia novo clique por 10s para evitar spam no gateway.

### 2. Forçar refresh no gateway (edge function)

- Hoje `partner-shop-check-status` só consulta o gateway quando o pedido está `pending`. Já está adequado para o botão.
- Adicionar um pequeno log (`console.log`) com `tx_id` e status remoto retornado, para facilitar diagnóstico futuro nas Edge Function logs.

### 3. Reconciliação manual por admin (pedido com comprovante)

Criar painel simples em `/dashboard/pedidos` (ou nova aba "Pedidos travados") visível apenas para admins:

- Lista pedidos com `status='pending'` há mais de 5 minutos.
- Mostra: cliente, e-mail, valor, tx_id, criado há X min, status remoto AbacatePay (consultado on-demand).
- Ações por linha:
  - **Marcar como pago manualmente**: abre dialog pedindo `notes` (ex.: "Comprovante e2e ID xxx — verificado em 07/05") e confirmação. Chama nova edge function `admin-force-paid-order`.
  - **Cancelar/expirar pedido**: marca como `expired`, libera bot se houver.

### 4. Edge function `admin-force-paid-order`

- Valida que o caller é admin (via `has_role`).
- Atualiza pedido: `status='paid'`, `paid_at=now()`, `failed_reason=null`, salva `notes` em `raw_payload.adminOverride`.
- Se tinha `balance_applied_credits` pendente (cross-token), aplica via `apply_balance_with_token` / `apply_balance_to_order` (mesmo fluxo do webhook).
- Chama `assign_bot_to_order` para entregar.
- Loga em `partner_credit_ledger` uma entrada de auditoria com `reason='admin_manual_paid:<notes>'`.

## Detalhes técnicos

**Arquivos a editar:**
- `src/pages/ComprarParceiro.tsx` — botão "Já paguei", handler com debounce.
- `src/pages/dashboard/Pedidos.tsx` (ou novo) — UI admin de reconciliação.
- `supabase/functions/partner-shop-check-status/index.ts` — log do status remoto.

**Novos arquivos:**
- `supabase/functions/admin-force-paid-order/index.ts` — força pago + atribui bot.

**Sem mudanças no schema do banco.** O `raw_payload jsonb` já existe e cabe o `adminOverride`. A tabela `partner_credit_ledger` já está pronta para registrar a auditoria.

## Para o pedido específico (R$ 1,00 endersonaguiartrader)

Depois que a UI admin estiver pronta, você abre, anexa o comprovante nas notas e marca como pago — ele entra na fila normalmente.
