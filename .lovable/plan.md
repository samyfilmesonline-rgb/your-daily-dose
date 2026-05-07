## Objetivo

Dar ao cliente final visibilidade em tempo real do farm dos créditos e adicionar um passo explícito de "Já adicionei o bot como Owner" para o sistema iniciar o processo com confiança.

## O que o banco já oferece (e dá pra mostrar ao cliente)

A tabela `execucoes_lovable` já é alimentada pelo worker Python a cada execução de farm (chave: `id_do_usuario` = parceiro, `email_lovable` = bot, `workspace_nome` = workspace do cliente). Campos úteis:

- `status` (`em_andamento`, `concluido`/`sucesso`, `falha`/`erro`, `limite`)
- `creditos_iniciais`, `creditos_finais`, `creditos_adicionados`
- `iniciado_em`, `atualizado_em`, `finalizado_em`
- `erro` (quando falha)

A `farm_bots` tem `status` (idle/busy), `last_heartbeat_at`, `current_order_id` — útil para mostrar "bot online / heartbeat há X seg".

A `partner_credit_orders` já tem `credits` (meta), `delivered_at`, `failed_reason`.

Com isso dá pra montar uma barra de progresso **créditos farmados / meta** + lista das tentativas (ciclos) com horário e resultado, atualizando via realtime.

## Mudanças

### 1. Banco (1 migration)

- Adicionar em `partner_credit_orders`:
  - `bot_invite_confirmed_at timestamptz` — quando o cliente clicou em "já convidei o bot".
  - (opcional) `bot_invite_confirmed_fingerprint text` — auditoria.
- Função RPC `confirm_bot_invite(_order_id uuid, _fingerprint text)` (SECURITY DEFINER) que:
  - valida `client_fingerprint = _fingerprint`
  - só grava se `assigned_bot_id IS NOT NULL` e status em `paid|queued|processing`
  - retorna o registro atualizado
- Política/grant: nenhuma nova policy (acesso só via edge function).
- Habilitar `REPLICA IDENTITY FULL` + `ALTER PUBLICATION supabase_realtime ADD TABLE` para `partner_credit_orders` e `execucoes_lovable` (se ainda não estiverem) — necessário para o realtime já usado no front.

### 2. Edge functions

**Nova: `partner-shop-confirm-invite`** (público, service role):
- Body: `{ orderId, fingerprint }`
- Chama a RPC acima. Retorna `{ ok, order }`.

**Atualizar: `partner-shop-check-status`**
- Passar a retornar também:
  - `botInviteConfirmedAt`
  - `progress`: `{ farmed, target, percent, lastEventAt, lastStatus, currentExecution: { status, creditosIniciais, creditosFinais, creditosAdicionados, atualizadoEm, erro } | null, attempts: number }`
- Cálculo: agregação em `execucoes_lovable` filtrando por `id_do_usuario = order.partner_id`, `email_lovable = bot.email_lovable`, `workspace_nome = order.target_workspace`, somente registros com `iniciado_em >= order.assigned_at`.
  - `farmed = SUM(creditos_adicionados)` desde `assigned_at`
  - `target = order.credits`
  - `currentExecution`: a mais recente
  - `attempts = COUNT(*)` no mesmo recorte

**Atualizar: `partner-shop-list-orders`**
- Incluir `botInviteConfirmedAt` e um `progress` resumido (`farmed`, `target`, `percent`) por pedido. Mesma agregação.

### 3. Frontend (`src/pages/ComprarParceiro.tsx`)

`OrderTrackingInline` (também usado no `HistoryTrackingDialog`):

1. **Bloco "convide o bot"**: adicionar checkbox/botão "Já adicionei o bot como Owner no meu workspace".
   - Ao clicar: chama `partner-shop-confirm-invite` e salva timestamp local + atualiza estado.
   - Enquanto não confirmado: mostra alerta amarelo "Aguardando você convidar o bot".
   - Após confirmado: bloco vira verde "Convite confirmado às HH:MM — iniciando farm…" e mostra spinner do bot trabalhando.

2. **Painel de progresso em tempo real** (aparece quando `botInviteConfirmedAt` ou `currentExecution` existe):
   - Barra de progresso `farmed / target` (componente `Progress`).
   - Texto grande: `{farmed} / {target} créditos` + `{percent}%`.
   - Linha do bot: `Bot {botEmail} • status: {idle|busy} • heartbeat há Xs` (consulta `farm_bots` via realtime já existe? se não, incluir no payload do check-status).
   - "Tentativa atual: {status} • iniciada às HH:MM • atualizada há Xs".
   - Lista compacta das últimas 5 execuções (ícone sucesso/falha/limite + créditos + horário).
   - Mensagem contextual:
     - `em_andamento`: "Farmando agora…"
     - `limite`: "Lovable bloqueou temporariamente, próxima tentativa automática"
     - `falha`: mostrar `erro`
     - `sucesso` parcial: "Mais N créditos restantes"
     - meta atingida: muda para tela de sucesso (já existente).

3. **Realtime**: além do canal já existente em `partner_credit_orders`, assinar `execucoes_lovable` filtrando `email_lovable=eq.{botEmail}` e `workspace_nome=eq.{workspace}` para refazer o `check-status` ao detectar mudanças. Polling cai de 5s para 10s como fallback.

4. **`OrdersHistorySection`**: cada card de pedido em andamento mostra mini-barra `farmed/target` para o cliente ter noção mesmo sem abrir o dialog.

### 4. Worker Python (fora do escopo desta entrega — só anotar)

Nenhuma alteração obrigatória: ele já grava em `execucoes_lovable`. Recomendação para depois: ler `bot_invite_confirmed_at` antes de tentar logar no workspace, evitando falhas por bot ainda não convidado. Por ora o front bloqueia o fluxo até a confirmação, então não é crítico.

## Ordem de execução

1. Migration (coluna + RPC + realtime publication).
2. Atualizar 3 edge functions e criar a nova.
3. Atualizar `ComprarParceiro.tsx` (componentes `OrderTrackingInline`, `OrdersHistorySection`).
4. QA: criar pedido teste, conferir progresso atualizando ao vivo via realtime.

## O que NÃO muda

- Fluxo de pagamento Pix, fingerprint, cancelamento, atribuição de bot, RLS existentes.
- Worker Python.
- Painel admin.
