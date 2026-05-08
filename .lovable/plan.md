# Botão "Resgatar saldo" para gastar créditos sem Pix

## Problema

O único pacote do parceiro custa **R$ 1,00 por 200 créditos** (= R$ 0,005 por crédito). O AbacatePay exige Pix mínimo de R$ 1,00. Por isso, qualquer saldo parcial (ex: 160 créditos) não cabe no fluxo atual:

- Sem o limitador → Pix de R$ 0,20 é rejeitado.
- Com o limitador atual → o saldo é zerado e o cliente paga o pacote inteiro de novo, sem usar o saldo.

Solução: criar um caminho que **entrega só os créditos do saldo**, sem passar pelo Pix nem pelo conceito de "pacote".

## Como vai funcionar (UX)

Na aba **"Meus pedidos"**, no card "Saldo disponível" (já existe), adicionar:

1. **Botão "Resgatar saldo em workspace"** — visível quando `customerBalance.credits > 0`.
2. Ao clicar, abre um diálogo com:
   - Quantidade a resgatar (default = saldo total; min 1; max = saldo).
   - Campo "Workspace de destino" (mesmo padrão do checkout).
   - Botão "Entregar agora" (sem Pix).
3. Após confirmar, cria pedido `status=paid` `amount_cents=0` com os créditos pedidos, debita o saldo e dispara o bot — exatamente o mesmo fluxo do "saldo cobre 100%" que já existe em `partner-shop-create-pix`.
4. O pedido aparece no histórico e o cliente acompanha a entrega como qualquer outro.

## Mudanças técnicas

### Nova edge function `partner-shop-redeem-balance`
Recebe: `{ partnerId, customerEmail, clientFingerprint, targetWorkspace, credits, customerName?, customerWhatsapp? }`.

Lógica:
- Valida fingerprint contra `partner_customer_balances` (mesmo padrão das outras functions).
- Confere `credits <= saldo disponível` e `credits >= 1`.
- Insere `partner_credit_orders` com `status='paid'`, `amount_cents=0`, `paid_at=now()`, `balance_applied_credits=credits`, `balance_applied_cents=0`, `pack_id=null`.
- Chama `apply_balance_to_order` (RPC já existente) para debitar o saldo.
- Chama `assign_bot_to_order` (RPC já existente) para iniciar a entrega.
- Retorna `{ orderId }`.

Sem secrets novos. `verify_jwt = false` (mesmo padrão das outras `partner-shop-*`).

### Frontend `src/pages/ComprarParceiro.tsx`
- No card de saldo (aba "Meus pedidos"), adicionar botão **"Resgatar saldo"**.
- Novo dialog `RedeemBalanceDialog` com input de créditos + workspace.
- Após sucesso: refazer `fetchHistory()` e abrir o tracking do pedido criado.

### Banco
Nenhuma migração. Usa tabelas e RPCs existentes (`partner_credit_orders`, `apply_balance_to_order`, `assign_bot_to_order`).

## Fora do escopo
- Não muda o fluxo de compra de pacote.
- Não mexe no limitador de Pix mínimo (continua válido para casos onde o saldo cobre apenas parte e ainda sobra um valor pagável ≥ R$ 1,00).
