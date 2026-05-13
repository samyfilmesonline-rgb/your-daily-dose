## Diagnóstico

Olhei as 2 programações no banco — ambas estão `active`, sem nenhum erro:

| criada em | start_at | next_run_at | runs |
|---|---|---|---|
| 08:21:07 | 08:22:00 | 08:22:00 | 0/0 |
| 08:22:36 | 08:23:00 | 08:23:00 | 0/0 |

Elas **não estão quebradas** — estão só esperando o cron rodar. Dois problemas combinados:

1. **Cron está em `*/5 * * * *`** (a cada 5 min). Então um `next_run_at` de 08:22 só é disparado às 08:25.
2. **O frontend força `startAt` pro próximo minuto cheio** (ex: clicou às 08:22:36 → `start_at = 08:23:00`). Como `08:23 > now + 5s`, o `create-order-schedule` **não dispara o primeiro tick imediatamente** e cai na fila do cron.

Resultado: o usuário cria, espera ver o pedido aparecer, e fica até ~5 minutos achando que travou.

## Correção

### 1. Cron a cada 1 minuto
Atualizar o job `partner-shop-schedule-tick-5min` para `* * * * *`. Custo é desprezível (a tick filtra por `next_run_at <= now`, então sem schedule devida não cria pedido).

### 2. Frontend: opção "Começar agora" (default)

No `ManualOrderDialog`, no bloco "Repetir diariamente":

- Adicionar checkbox **"Começar agora"** marcado por default.
- Quando marcado: input `datetime-local` fica oculto/disabled e o submit envia `startAt` = momento do clique (Date.now()).
- Quando desmarcado: mostra o `datetime-local` (default = agora + 1 min) para agendar pra mais tarde.

Assim o caminho comum ("quero começar já") cai no fast-path do create function e dispara o primeiro pedido na hora.

### 3. Backend: ajustar tolerância

No `partner-shop-create-order-schedule`:
- Quando `startAt` vem ≤ `now + 60s`, clampa pra `now()` e dispara o tick imediato (hoje a tolerância é 5s — apertada demais quando o frontend arredonda pro próximo minuto).
- Quando `startAt` é claramente futuro (> 60s), mantém comportamento atual (cron pega).

### 4. UX em `Programacoes.tsx`

Coluna "Próximo": se `next_run_at` está no passado e `runs_completed = 0`, mostrar badge **"Aguardando cron (até 1 min)"** em vez de só a hora — deixa claro que está pra rodar.

## Fora de escopo

- Disparar tick via webhook do banco (overkill — cron de 1 min resolve).
- Mudar o intervalo entre runs (continua diário).

## Resumo do que vou mexer

- **SQL** (insert, não migration — contém a anon key): `cron.unschedule` + `cron.schedule` com `* * * * *`.
- **Edge function** `partner-shop-create-order-schedule`: tolerância 5s → 60s.
- **Frontend** `ManualOrderDialog.tsx`: checkbox "Começar agora".
- **Frontend** `Programacoes.tsx`: badge "Aguardando cron".
