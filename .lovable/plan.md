## Objetivo

Hoje o cliente final só vê a barra `farmed/target`. O worker já grava em `execucoes_lovable` mensagens úteis (ex.: "Workspaces detectados...", "Workspace encontrado...", erros de login, "limite", etc.) no campo `erro` + `status`, mas nada disso chega na UI dos cards de pedidos. Vamos expor esse último evento tanto na listagem quanto no tracking detalhado.

## Mudanças

### 1. Edge function `partner-shop-list-orders`

No bloco que já calcula `progressMap`, ampliar a query e o payload:

- Trocar `select("creditos_adicionados")` por `select("status, creditos_adicionados, erro, atualizado_em, iniciado_em")` ordenado por `iniciado_em desc`.
- Continuar somando `farmed = SUM(creditos_adicionados)`.
- Adicionar ao `progressMap[o.id]`:
  - `lastStatus`: status da execução mais recente (`em_andamento` | `sucesso`/`concluido` | `falha`/`erro` | `limite`).
  - `lastMessage`: `erro` da execução mais recente (o worker usa esse campo tanto para mensagens informativas quanto para erros).
  - `lastEventAt`: `atualizado_em` da execução mais recente.
  - `attempts`: total de execuções no recorte.
- Refletir esses campos no objeto `progress` do item retornado (default `{ farmed:0, percent:0, lastStatus:null, lastMessage:null, lastEventAt:null, attempts:0 }`).

### 2. Edge function `partner-shop-check-status`

Já retorna `progress.currentExecution.erro` e `recent[].erro`, mas o frontend não exibe. Garantir que `currentExecution` também inclua um campo `mensagem` (alias de `erro`) só por clareza semântica — opcional, podemos manter `erro` mesmo. Sem mudanças estruturais aqui.

### 3. Frontend `src/pages/ComprarParceiro.tsx`

**`OrderTrackingInline` (painel ao vivo):**
- Abaixo da barra de progresso, adicionar uma linha "Última atividade do bot" com:
  - Ícone por status (`Loader2` para `em_andamento`, `CheckCircle2` para sucesso, `AlertTriangle` para `limite`, `XCircle` para `falha`).
  - Texto = `progress.currentExecution.erro` (ou fallback "Aguardando próximo ciclo…" se vazio).
  - Timestamp relativo ("há Xs") usando `atualizadoEm`.
- Na lista "Últimas tentativas" (recent), mostrar a mensagem `erro` truncada ao lado do status, não só status + créditos.

**`OrdersHistorySection` (cards do histórico):**
- Para pedidos `paid|queued|processing` com `progress.lastMessage`, exibir uma linha discreta abaixo da mini-barra:
  - `lastStatus === "em_andamento"` → texto azul "Bot: {lastMessage}".
  - `lastStatus === "limite"` → texto âmbar "Aguardando liberação: {lastMessage}".
  - `lastStatus === "falha"|"erro"` → texto vermelho "Tentando novamente: {lastMessage}".
  - `lastStatus === "sucesso"|"concluido"` → texto verde "Último ciclo: +X créditos".
- Truncar em ~80 chars com `line-clamp-2`.

### 4. Tipos

Atualizar a interface local `OrderItem`/`Progress` no `ComprarParceiro.tsx` para incluir `lastStatus`, `lastMessage`, `lastEventAt`, `attempts`. Nenhuma migration necessária — só leitura.

## O que NÃO muda

- Schema do banco, RPC, RLS, worker Python, fluxo Pix, fingerprint, realtime subscriptions.
- `partner-shop-check-status` já entrega o dado; só o consumo no front muda.

## Ordem de execução

1. Ajustar `partner-shop-list-orders` (query + payload).
2. Ajustar `OrderTrackingInline` para exibir mensagem da execução atual + erro nas linhas do `recent`.
3. Ajustar `OrdersHistorySection` para exibir `progress.lastMessage` por card.
4. QA: criar pedido teste, conferir que mensagens "Workspaces detectados…" e "Workspace encontrado…" aparecem ao vivo no card e no painel.
