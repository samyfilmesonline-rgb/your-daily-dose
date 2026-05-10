## Objetivo

Trocar o comportamento do botão **"Usar meu saldo agora"** (banner verde do topo da página de compra). Hoje ele só rola a tela até os pacotes na aba "Comprar". O correto é abrir um **modal dedicado** que deixa o cliente:

1. **Refazer o pedido reembolsado** que originou o saldo (mesmos dados, saldo aplicado), ou
2. **Fazer um novo pedido** com o saldo já aplicado, escolhendo qualquer pacote.

O fluxo de compra/checkout em si não muda — só o ponto de entrada.

---

## Mudanças

### 1. Novo modal `UseBalanceDialog` (em `src/pages/ComprarParceiro.tsx`)

- Abre via novo state `useBalanceOpen`.
- Cabeçalho hacker-mono mostrando saldo: `{totalAvailableBalance} créditos · vinculado a {email}`.
- Duas seções:
  - **"Refazer um pedido anterior"** — lista os pedidos do `history` com `refundedCredits > 0` (ordenados do mais recente). Cada item mostra: pacote (créditos), data, créditos reembolsados. Botão **"Refazer este pedido"** chama `reorderFromHistory(item)` (já pré-preenche tudo e aplica saldo) e fecha o modal.
  - **"Fazer um novo pedido"** — grade compacta dos `packs` ativos. Cada card mostra créditos, preço original, **preço final com saldo aplicado** (usa `computePriceWithBalance`). Clicar seleciona o pacote: `setSelected(p)`, `setUseBalance(true)`, `setStep("form")`, fecha o modal.
- Se `history` ainda não carregou, dispara `fetchHistory()` ao abrir e mostra skeleton enquanto carrega.
- Se não houver pedido reembolsado no histórico (saldo veio de transferência/outro e-mail), esconde a primeira seção e mantém só a de novo pedido.
- Estilo segue tokens do design system existente (verde esmeralda + `font-mono`, bordas `border-emerald-500/40`).

### 2. Botão "Usar meu saldo agora" (linha ~611)

- Substituir o `onClick` atual (`setTab("comprar") + scroll`) por `setUseBalanceOpen(true)`.

### 3. Botão "Usar saldo" da aba Pedidos (linha ~789)

- Trocar `onClick={() => setTab("comprar")}` para também abrir o mesmo modal (`setUseBalanceOpen(true)`), garantindo consistência.

---

## Detalhes técnicos

- O state `useBalance` continua sendo aplicado automaticamente nas duas opções, então o cálculo de Pix/saldo no formulário não muda.
- `reorderFromHistory` já existe e já cobre o caso "mesmo pacote + dados do cliente preenchidos" — apenas é reutilizado.
- Para novo pedido, não pré-preencher dados do cliente: usa o estado atual do form (ou vazio), igual ao fluxo normal de seleção de pacote.
- Componente novo fica dentro do mesmo arquivo (`ComprarParceiro.tsx`) usando `Dialog` do shadcn já importado.
- Sem mudanças em edge functions, types ou backend.

---

## Fora do escopo

- Não mexer em nada de farm/processamento.
- Não mudar o cálculo de saldo nem regras de reembolso.
- Não alterar o botão "Resgatar agora" (resgate em workspace), que é fluxo diferente.