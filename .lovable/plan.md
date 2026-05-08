## Diagnóstico

Pedido manual `9564b4c1…` está `processing` com bot atribuído, mas `bot_invite_confirmed_at IS NULL`. O worker espera pelo passo `confirm_bot_invite` — que existe só no fluxo PIX do cliente (cliente confirma na tela dele que o bot foi convidado ao workspace). Em recarga manual não há cliente nessa etapa, então trava.

## Solução: auto-confirmar o convite em pedidos manuais

### 1) Edge `partner-shop-create-manual-order`
No payload do `insert`, adicionar:
```ts
bot_invite_confirmed_at: nowIso,
bot_invite_confirmed_fingerprint: "manual",
```
Assim, assim que o bot pegar o pedido, já encontra a confirmação e começa a farmar.

### 2) SQL — atualizar `retry_manual_order`
No `UPDATE` que reseta o pedido para nova tentativa, garantir:
```sql
bot_invite_confirmed_at = now(),
bot_invite_confirmed_fingerprint = COALESCE(bot_invite_confirmed_fingerprint, 'manual')
```
Cobre pedidos manuais antigos (criados antes do fix #1) que ainda tenham o campo NULL.

### 3) Backfill imediato
Migração de dados:
```sql
UPDATE partner_credit_orders
   SET bot_invite_confirmed_at = now(),
       bot_invite_confirmed_fingerprint = 'manual'
 WHERE is_manual = true
   AND bot_invite_confirmed_at IS NULL
   AND status IN ('paid','queued','processing');
```
Destrava o pedido `9564b4c1…` que está aguardando agora.

## Fora de escopo
- Mudar a lógica do worker.
- Mudar pedidos PIX (continuam exigindo a confirmação do cliente).
