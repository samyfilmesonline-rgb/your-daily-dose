## Problema

Em **Meus pedidos**, ao clicar em **Refazer pedido**, hoje o cliente é jogado pra aba "Comprar créditos" e cai na seleção de pacote/formulário. Isso confunde porque parece que o pedido sumiu e ele tem que começar do zero.

Além disso, só `email` e `workspace` são reaproveitados — `nome`, `WhatsApp` e `CPF` ficam em branco, obrigando o cliente a redigitar tudo.

## O que muda

Comportamento desejado: clicar em **Refazer pedido** abre direto o modal "Seus dados" **por cima da aba Meus pedidos** (sem trocar de aba), com **todos os campos já preenchidos** exatamente como no pedido original. O cliente revisa, edita o que quiser e confirma.

### 1. `supabase/functions/partner-shop-list-orders/index.ts`

Incluir no `select` os campos `customer_name, customer_whatsapp, customer_tax_id` e devolver no item da lista:

- `customerName: o.customer_name`
- `customerWhatsapp: ownDevice ? o.customer_whatsapp : null` (privacidade)
- `customerTaxId: ownDevice ? o.customer_tax_id : null` (privacidade — só visível no próprio device)

### 2. `src/pages/ComprarParceiro.tsx`

a. Adicionar `customerName`, `customerWhatsapp`, `customerTaxId` ao type `OrderHistoryItem`.

b. Em `reorderFromHistory(item)`:
- **Remover** `setTab("comprar")` — manter o usuário na aba "Meus pedidos".
- Pré-preencher também:
  - `setName(item.customerName ?? "")`
  - `setWhatsapp(item.customerWhatsapp ?? "")`
  - `setTaxId(item.customerTaxId ?? "")`
- Continuar fazendo `setStep("form")` para abrir o Dialog "Seus dados" como overlay sobre a aba atual.

c. No `onOpenChange` do Dialog "Seus dados" (linha 917), ao fechar voltar para o estado anterior sem forçar `browse` quando o usuário veio de "Meus pedidos" — basta não trocar a tab (ela já está em "pedidos") e limpar `prefillOrderId`. Comportamento atual de `setStep("browse")` segue OK.

d. Ajustar o texto do banner verde dentro do dialog (linhas 925-934) para refletir que é uma cópia editável do pedido anterior:
- Título: "Mesmos dados do pedido anterior"
- Sub: "Revise ou ajuste qualquer campo antes de confirmar."

### 3. Sem mudanças em

- Schema, RLS, fluxos de pagamento, criação de pedido, saldo.
- Aba "Comprar créditos" continua acessível normalmente.

## Verificação

- Em "Meus pedidos", clicar **Refazer pedido** num pedido `refunded`/`failed`/`expired` próprio → o modal "Seus dados" abre por cima da lista, sem trocar de aba, com nome/email/whatsapp/CPF/workspace já preenchidos.
- Fechar o modal volta direto pra lista de pedidos no mesmo lugar.
- Editar qualquer campo e confirmar gera o pedido normalmente (com abate de saldo se aplicável).
