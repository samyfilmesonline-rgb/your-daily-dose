## Objetivo

No modal **"Seus dados"** (form de checkout), quando o cliente está refazendo um pedido (ou comprando com saldo aplicado), ajustar o botão final e adicionar um **aviso de saldo parcial** com duas opções claras quando o saldo não cobre o pacote inteiro.

Hoje o botão mostra:
- "Confirmar pedido GRÁTIS com saldo" — quando saldo ≥ pacote
- "Gerar Pix" — em todo o resto (inclusive quando saldo cobre só uma parte)

O problema: quando o cliente tem 40 créditos e refaz pedido de 200, ele vê só "Gerar Pix" sem entender que está pagando só a diferença, e sem ter alternativa de fazer um pedido menor com o saldo que tem.

---

## Mudanças

### 1. Frontend — `src/pages/ComprarParceiro.tsx` (modal "Seus dados", linhas ~926–1013)

**Detectar três cenários** com base em `selected.credits`, `totalAvailableBalance`, `useBalance`:

- `fullCovered` — saldo ≥ créditos do pacote → 1 botão: **"Confirmar pedido GRÁTIS com saldo"** (igual hoje).
- `partial` — `0 < saldo < pacote` → mostrar aviso âmbar e **2 botões**.
- `noBalance` — saldo = 0 (ou `useBalance` desligado) → 1 botão: **"Gerar Pix"** (igual hoje).

**Aviso de saldo parcial** (acima do form, substitui/complementa o card verde de resumo quando for `partial`):

```
Você tem {saldo} créditos no seu saldo.
Para o pedido de {pacote.credits} créditos faltam {diff} créditos.
Pagando via Pix: R$ {valorRestante}
```
Estilo: `border-amber-500/40 bg-amber-500/5`, `font-mono`, ícone de alerta.

**Botões no caso `partial`** (substituem o botão único atual):
1. **"Pagar R$ {valor} via Pix e completar o pedido"** — `type="submit"` (fluxo atual `submit()` já suporta saldo parcial; backend já calcula).
2. **"Usar só meus {saldo} créditos (sem Pix)"** — `type="button"`, chama novo handler `submitBalanceOnly()` que faz POST em nova edge function `partner-shop-create-balance-only-order` com os mesmos campos do form (sem `packId`).

Após sucesso de `submitBalanceOnly`: reaproveita o mesmo fluxo de `step="paid"` + `setActiveOrderId(order.id)` que já existe para pedido pago com saldo.

### 2. Backend — nova edge function `partner-shop-create-balance-only-order`

Cria pedido custom com a quantidade exata do saldo (sem Pix, sem pacote).

**Body (zod):** `partnerId`, `customerName`, `customerEmail`, `customerWhatsapp`, `customerTaxId`, `targetWorkspace`, `clientFingerprint?`.

**Lógica:**
1. Validar CPF/CNPJ + WhatsApp (igual ao `partner-shop-create-pix`).
2. Buscar saldo do cliente em `partner_customer_balances` por `(partner_id, customer_email)`.
3. Validar `saldo > 0`. Se não, 400.
4. Inserir em `partner_credit_orders`:
   - `pack_id: null` (coluna já é nullable)
   - `credits: saldo`
   - `amount_cents: 0`
   - `status: "paid"`, `paid_at: now()`
   - `balance_applied_credits: saldo`, `balance_applied_cents: 0`
   - demais campos do cliente + fingerprint
5. Chamar `apply_balance_to_order` (RPC existente). Se 0, marcar `expired` e devolver 409.
6. Chamar `assign_bot_to_order`.
7. Retornar `{ orderId, paidWithBalance: true, credits: saldo }`.

Sem mudanças em RLS nem em SQL — `pack_id` já aceita NULL e as RPCs já existem.

### 3. Integração no frontend

- Adicionar `submitBalanceOnly()` ao lado do `submit()` atual, reutilizando os mesmos states do form (name/email/whatsapp/taxId/workspace).
- Após sucesso, mesmo comportamento de `paidWithBalance: true` que `submit()` faz: `setStep("paid")` + atualizar histórico.
- Toast de confirmação: "Pedido de {N} créditos criado usando seu saldo."

---

## Detalhes técnicos

- O backend de Pix atual **já calcula corretamente** o caso parcial (`creditsToCharge = pack.credits - balanceToApply`), então o botão "Pagar via Pix" só precisa rotular melhor o valor final (`computePriceWithBalance(...).payCents`) — sem mudanças no edge function de Pix.
- `pack_id` em `partner_credit_orders` é nullable, então pedido custom não quebra nada. O front-end de listagem (`partner-shop-list-orders`) e de display de cards já lida com `targetWorkspace`/`credits` direto da row, sem depender de `pack_id`.
- Nova função entra como mais um `supabase.functions.invoke("partner-shop-create-balance-only-order", ...)` — deploy automático.
- Se saldo for 0 ou form aberto sem refazer pedido, nada muda visualmente.

---

## Fora do escopo

- Não alterar o fluxo de Pix existente nem regras de saldo.
- Não mudar pacotes do parceiro (continuam fixos).
- Não mexer no modal "Usar meu saldo agora" (já feito antes).
