## Problema

Quando um pedido é reembolsado (parcial ou total), os créditos voltam como saldo, mas refazer um novo pedido com esse saldo está confuso:

1. **Saldo invisível na aba "Comprar"** — só aparece na aba "Pedidos".
2. **Sem CTA direto no card reembolsado** — cliente precisa navegar de volta, escolher pacote, preencher tudo.
3. **Checkbox "Usar saldo" escondido** dentro do dialog de confirmação, sem deixar claro o valor final.
4. **Mensagens vagas** — "saldo", "reembolso automático" não comunicam que é dinheiro pronto pra usar.
5. **Form pede tudo de novo** (e-mail, workspace, WhatsApp, CPF) mesmo já tendo dado tudo no pedido anterior.

## Solução

Tornar o caminho "tenho saldo → novo pedido" um fluxo de 1-2 cliques, com o saldo visível em todos os pontos críticos.

### 1. Banner de saldo fixo no topo (ambas as abas)

Quando `customerBalance.credits > 0`, mostra banner verde fixo logo abaixo do header — visível tanto em "Comprar" quanto em "Pedidos":

```text
┌─────────────────────────────────────────────────────────┐
│ 💰 Você tem 173 créditos de saldo (cliente@email.com)   │
│    Use agora em qualquer pacote sem pagar nada extra    │
│                                  [ Usar meu saldo → ]   │
└─────────────────────────────────────────────────────────┘
```

- Botão "Usar meu saldo" rola até a lista de pacotes e destaca os que ficam **grátis ou com desconto** com o saldo.
- Cada card de pacote ganha um selo verde quando o saldo cobre/abate: **"Você paga apenas R$ X com seu saldo"** ou **"GRÁTIS com seu saldo"**.

### 2. Botão "Refazer pedido" no card de pedido reembolsado/parado

No card de cada pedido com status `refunded` (ou `failed`/`expired` com saldo gerado), substitui o atual texto solto por:

```text
✓ 173 créditos voltaram como saldo
[ 🔄 Refazer pedido grátis com meu saldo ]
```

Ao clicar:
- Pré-seleciona o **mesmo pacote** do pedido anterior (mesmo `credits`).
- Pré-preenche **e-mail, workspace, WhatsApp, CPF, nome** do pedido anterior.
- Marca `useBalance = true` automaticamente.
- Pula o dialog de confirmação e vai direto pro form (já preenchido) com botão grande **"Confirmar e gerar pedido (GRÁTIS)"** ou **"Confirmar e gerar Pix de R$ X"** se faltar valor.

### 3. Card do pacote com cálculo de saldo embutido

Atualmente o card mostra só "Comprar 200 créditos · R$ 27,00". Vira:

```text
┌───────────────────────────────┐
│ 200 créditos · R$ 27,00       │
│ ─────────────────────────     │
│ Seu saldo: -173 créditos      │
│ Você paga: R$ 3,65 via Pix    │
│ [ Continuar com saldo ]       │
└───────────────────────────────┘
```

Se saldo cobre 100%: botão diz **"Pegar GRÁTIS com meu saldo"** em destaque.

### 4. Form pré-preenchido + atalho para repetir

Quando o cliente já tem histórico (mesmo fingerprint OU mesmo e-mail no `LAST_EMAIL_KEY`), ao abrir o form mostrar topo:

```text
┌─────────────────────────────────────────┐
│ ↻ Usar dados do pedido anterior?        │
│   email, workspace, WhatsApp, CPF       │
│              [ Sim, preencher ]         │
└─────────────────────────────────────────┘
```

Pega do último pedido em `history` e popula todos os campos. Cliente só revisa.

### 5. Texto mais claro

Substituições globais:

| Antes | Depois |
|-------|--------|
| "saldo" (sozinho) | "créditos no seu saldo" / "crédito disponível" |
| "Reembolso automático" | "Crédito automático para próximo pedido" |
| "Usar meu saldo" | "Abater do meu saldo (R$ X)" |
| "voltam como saldo" | "voltam como crédito pra usar em outro pedido" |

## Arquivos

- `src/pages/ComprarParceiro.tsx` — único arquivo afetado:
  - Banner de saldo no topo (acima do `<Tabs>`)
  - Card do pack com cálculo de saldo + CTA contextual
  - Botão "Refazer pedido" no card reembolsado dentro de `OrdersHistorySection`
  - Pré-preenchimento do form quando vier do "Refazer pedido" ou de "Usar saldo"
  - Atualização de microcopy

Sem mudanças em backend, edge functions ou banco — toda a lógica de saldo já existe e funciona.

## Detalhes técnicos

- Estado novo: `prefillFromOrderId: string | null` para identificar quando preencher tudo automaticamente.
- Helper `computePriceWithBalance(pack, balance)` retorna `{ payCents, freeWithBalance, balanceUsed }`.
- O atual `crossAuth` (saldo de outro e-mail) também entra no cálculo.
- Banner usa `customerBalance` que já é carregado em `fetchHistory()` no mount.
