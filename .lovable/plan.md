## Objetivo

Dar mais controle sobre programações:
1. Escolher **data e hora** do primeiro farm (não começa mais "agora" forçado).
2. Novo modo de término: **"total de créditos a recarregar"** — o sistema calcula quantos dias precisa.
3. Mantém os modos atuais ("Por X dias" e "Até data").

## Mudanças

### 1. Banco — `partner_order_schedules` (migration)

Adicionar:
- `total_credits_target integer null` — meta total de créditos quando o usuário escolhe o novo modo.

E expandir o enum `order_schedule_end_mode` para aceitar `'total_credits'` além de `'days'` e `'until_date'`.

Trigger de validação atualizado:
- `end_mode = 'total_credits'` → exige `total_credits_target > 0`. Só permitido em **single-workspace** (multi-ws não tem como prever créditos/dia, depende do nº de workspaces).
- `start_at` continua obrigatório, mas vem do usuário (não mais `now()` automático).

`next_run_at` na criação = `start_at` (pode ser futuro).

### 2. Edge function `partner-shop-create-order-schedule`

Body ganha:
- `startAt: string (datetime ISO)` — obrigatório. Aceita futuro; se vier no passado, rejeita com 400 ("escolha um horário no futuro ou agora").
- `endMode: "days" | "until_date" | "total_credits"`
- `totalCreditsTarget?: number` — exigido quando `endMode === "total_credits"`.

Para `total_credits` em single-ws, calcula `total_days = ceil(totalCreditsTarget / credits)` e grava também `total_days` para que a UI exiba a duração estimada e o `schedule-tick` continue parando por contagem.

Para multi-ws, rejeita `total_credits` com 400 ("escolha por X dias ou até data — multi-workspace não suporta meta de créditos").

Não dispara `schedule-tick` imediatamente se `start_at > now()` (o cron vai pegar quando chegar a hora).

### 3. Edge function `partner-shop-schedule-tick`

- Continua igual: respeita `next_run_at`. Como ele é setado para o `start_at` escolhido, programações futuras só rodam a partir daquele momento.
- Lógica de término inalterada (já usa `total_days` ou `end_at`).

### 4. Frontend `ManualOrderDialog.tsx`

Quando "Repetir diariamente" estiver ligado:

**Bloco "Início":**
- Campo `Data e hora do primeiro farm` (input `datetime-local`), default = agora arredondado para o próximo minuto. Tooltip: "A partir desse horário o sistema cria 1 pedido por dia."

**Bloco "Término":** três opções via `RadioGroup`:
- `Por X dias` (existente)
- `Até data` (existente)
- `Por total de créditos` (NOVO, só aparece se single-ws)
  - Campo `Total de créditos a recarregar` (ex: 1000)
  - Texto auxiliar dinâmico: "Serão N dias de farm (créditos por dia / total = dias)."
  - Exemplo com `credits_per_run = 200` e total `1000` → "5 dias de farm, terminando em DD/MM HH:mm".

Validações:
- `start_at` ≥ agora (− 1 minuto de tolerância).
- `total_credits_target` deve ser múltiplo positivo de `credits_per_run` (se não, arredonda para cima e mostra aviso).

### 5. Frontend `Programacoes.tsx`

Coluna "Prazo" passa a mostrar:
- `days` → `N dias`
- `until_date` → `até DD/MM HH:mm`
- `total_credits` → `N créditos · ~M dias`

Coluna "Próximo" já mostra `next_run_at`, então a hora de início escolhida aparece naturalmente no primeiro tick.

## Detalhes técnicos

- Não é necessário mexer no worker desktop — o backend continua produzindo pedidos manuais comuns.
- Compatibilidade: programações antigas têm `total_credits_target = NULL` e seguem usando `days`/`until_date` exatamente como hoje.
- Multi-ws sem meta de créditos: justificado porque o número de workspaces (e portanto créditos/dia) só é conhecido em tempo de execução. Se o usuário insistir, pode usar "Por X dias".
- `start_at` no passado: tratado como "começar agora" pelo backend (clamp a `now()`), mas o frontend não permite escolher passado para evitar confusão.

## Fora de escopo

- Pausar/retomar com novo horário (já existe pause/resume genérico).
- Janela de horário (ex: "só rodar entre 9h e 18h") — fica para depois se pedir.
