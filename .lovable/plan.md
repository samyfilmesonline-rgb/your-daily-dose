## Objetivo

Mostrar mais informações de preview em cada item da lista **"Refazer um pedido anterior"** dentro do modal "Usar meu saldo agora", para o cliente identificar de bate-pronto qual pedido quer refazer — sem precisar abrir.

Hoje cada item mostra só créditos do pacote + valor reembolsado. Vamos adicionar workspace e e-mail (e mais alguns dados úteis) já no card.

---

## Mudanças (apenas em `src/pages/ComprarParceiro.tsx`)

Na seção **"Refazer um pedido anterior"** do `useBalanceOpen` Dialog, ajustar o card de cada pedido para exibir:

- **Linha 1 (destaque):** `{credits} créditos` + badge com créditos reembolsados.
- **Linha 2:** `workspace: {targetWorkspace ?? "—"}` em `font-mono`, com `truncate` para não quebrar layout.
- **Linha 3:** `e-mail: {customerEmail}` em `font-mono text-xs text-muted-foreground`, `truncate`.
- **Linha 4 (opcional, quando existir):** `cliente: {customerName}` — só renderiza se preenchido.
- **Linha 5:** data do pedido formatada (`createdAt`) + botão **"Refazer este pedido"** alinhado à direita.

Detalhes:
- Continua usando `reorderFromHistory(o)` + `setUseBalanceOpen(false)` no clique do botão.
- Mantém a ordem por `createdAt` desc e o filtro `refundedCredits > 0`.
- Mantém os tokens de design atuais (verde esmeralda, `font-mono`, `border-emerald-500/40`).
- Adiciona `title` nas linhas truncadas para mostrar valor completo no hover.
- Sem mudanças em backend, edge functions, types ou no fluxo de checkout.

---

## Fora do escopo

- Não mexer na seção "Fazer um novo pedido" do mesmo modal.
- Não alterar `reorderFromHistory` nem o pré-preenchimento do form (continua igual ao que já existe).
- Não mudar o cálculo de saldo ou regras de reembolso.
