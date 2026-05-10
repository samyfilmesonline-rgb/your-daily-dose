## Recarga manual em modo "todos os workspaces do bot"

Adiciona, no diálogo **Nova recarga manual**, uma opção que faz o bot farmar **200 créditos em cada workspace** que ele listar no Lovable, em sequência, até terminar todos.

### 1. Banco de dados (1 migration)

Novas colunas em `partner_credit_orders`:

- `multi_workspace_mode boolean not null default false` — liga o modo "varrer todos os ws".
- `workspaces_total integer` — quantos ws o bot encontrou (preenchido pelo worker no início).
- `workspaces_done integer not null default 0` — quantos já bateram 200 créditos.
- `workspaces_plan jsonb` — `[{ name, status: 'pending'|'running'|'done'|'failed', farmed, started_at, finished_at, error }]`, atualizado pelo worker.
- `current_workspace text` — nome do workspace que está rodando agora (substitui `target_workspace` durante o ciclo).
- `price_cents_per_workspace integer` — preço por ws de 200 créditos (definido no momento da criação).

`target_workspace` continua existindo: no modo single segue como hoje; no modo multi fica `null` na criação e é espelhado em `current_workspace` a cada troca, para reaproveitar todo o código atual de progresso/`workspace_not_found`/watchdog.

`credits` e `amount_cents` começam em `0` e são recalculados quando o worker reporta `workspaces_total` (ver §3): `credits = total*200`, `amount_cents = total * price_cents_per_workspace`.

### 2. Frontend — `ManualOrderDialog.tsx`

Novo switch **"Farmar todos os workspaces do bot (200 cada)"**. Disponível **só quando um bot específico foi escolhido** (não no modo "Automático").

Quando ligado:
- Esconde o campo "Workspace alvo" e "Créditos".
- Substitui o campo "Valor (R$)" por **"Valor por workspace (R$)"** com o mesmo input numérico.
- Mostra um aviso: "O bot vai listar os workspaces dessa conta no Lovable e farmar 200 créditos em cada um, em ordem. Total de créditos e valor finais aparecem após o início."
- Validação: `customerName`, `customerEmail`, `notes`, `pricePerWorkspaceReais`, `botId !== "auto"`.

### 3. Edge function `partner-shop-create-manual-order`

Aceita novos campos: `multiWorkspaceMode: boolean`, `pricePerWorkspaceCents: number`. Quando `true`:

- Ignora `targetWorkspace`, `credits`, `amountCents` do payload.
- Insere o pedido com `multi_workspace_mode=true`, `target_workspace=null`, `current_workspace=null`, `credits=0`, `amount_cents=0`, `workspaces_total=null`, `price_cents_per_workspace=pricePerWorkspaceCents`, `status='paid'`.
- **Não** chama `debit_partner_quota` ainda — o débito vira responsabilidade do passo de "iniciar workspace" (§4), porque ainda não sabemos o total. A quota é checada de forma frouxa: rejeita se o parceiro tem `< 200` créditos restantes (precisa de pelo menos 1 ws).
- Atribuição: como é sempre um bot específico, segue a lógica atual (claim atômico do bot ou queue).

### 4. Nova edge function `partner-shop-multi-workspace-tick`

Endpoint que o worker desktop chama em três momentos. Validação por fingerprint do bot (mesmo padrão de `partner-shop-confirm-invite` e `partner-shop-stop-order`).

Ações:

- **`action: "start"`** — payload `{ orderId, fingerprint, workspaces: string[] }`. O worker lista os ws da conta e envia. A função:
  - Salva `workspaces_total = workspaces.length`, monta `workspaces_plan` com todos como `pending`, atualiza `credits = total*200`, `amount_cents = total * price_cents_per_workspace`.
  - Marca o primeiro ws como `running`, escreve `current_workspace` e `target_workspace = ws[0]`.
  - Debita a quota do parceiro em `total*200` via `debit_partner_quota` (uma única vez). Se quota insuficiente, ajusta `workspaces_total` para o que cabe e trunca o plano.
  - Responde com o `currentWorkspace` que o worker deve farmar.

- **`action: "next"`** — payload `{ orderId, fingerprint, finishedWorkspace, farmed }`. Marca o ws atual como `done` (com `farmed`), incrementa `workspaces_done`. Se sobrar ws `pending`, promove o próximo a `running` e atualiza `current_workspace` + `target_workspace`. Responde `{ next: "<nome>" }` ou `{ done: true }`.

- **`action: "fail"`** — payload `{ orderId, fingerprint, workspace, reason }`. Marca o ws como `failed` com `error=reason`, incrementa `workspaces_done` (para parar de tentá-lo), passa para o próximo. Refund parcial só acontece no fim (ver abaixo).

Quando não há mais ws:
- Recalcula `credits` e `amount_cents` baseados no que efetivamente rodou (ws com status `done`), faz `refund_order_remainder` se sobrou (ws falhados/pulados), atualiza `status='delivered'`, `delivered_at=now()`, libera o bot (`status='idle'`, `current_order_id=null`) e chama `assign_next_queued_order`.

### 5. Cancelar / parar — `partner-shop-stop-order`

Comportamento já existe (`stop_requested_at`). Adicionamos no `tick`:

- No início de cada `next`/`fail`, se `stop_requested_at` está setado, finaliza o pedido como `canceled`, conta o `farmed` do ws atual no total realizado, faz refund da diferença, libera o bot. (Ou seja: "para no ws atual e encerra".)

### 6. Tela `Pedidos.tsx` — visualização

Quando `multi_workspace_mode`:
- Mostra "Workspace" como `current_workspace ?? "—"` com sufixo `· (X/Y workspaces)`.
- No modal de detalhes, lista `workspaces_plan` em uma tabela compacta (nome, status, créditos farmados, erro).
- Demais campos (progresso por execução) continuam funcionando sem mudança, porque já são filtrados por `target_workspace = current_workspace`.

### 7. Worker desktop (contrato — fora deste repo)

Documentado em `docs/desktop-updater.md` como adendo. Resumo do contrato:

```text
1. Recebe pedido com multi_workspace_mode=true.
2. Faz login, lista todos os workspaces da conta.
3. POST /partner-shop-multi-workspace-tick { action: "start", workspaces } → recebe currentWorkspace.
4. Loop:
   - Farma currentWorkspace até atingir 200 créditos (ou erro irrecuperável).
   - Em sucesso: POST { action: "next", finishedWorkspace, farmed: 200 } → next | done.
   - Em erro de ws: POST { action: "fail", workspace, reason } → next | done.
5. Em done=true, encerra a sessão.
```

Não alteramos o código do worker neste plano (é projeto separado), só publicamos o contrato.

### Detalhes técnicos

- `assign_bot_to_order` não é usado nesse fluxo: o bot já é escolhido na criação.
- `partner-shop-stalled-watchdog` continua funcionando porque sempre usa `target_workspace`, que estará espelhando o `current_workspace`.
- `payment_events` (timeline do checkout) ganha um evento extra do tipo `workspace_advanced` por troca, gravado pelo `tick` para o admin acompanhar. Sem nova trigger — insert direto.
- RLS de `payment_events` já restringe leitura ao admin; insert via service role no tick.
- Status do pedido no fim:
  - todos `done` → `delivered`
  - parou por stop → `canceled` com `refunded_credits` da parte não farmada
  - todos falharam → `failed` com `failed_reason='all_workspaces_failed'`

### Fora do escopo
- Mudar o worker desktop em si (só publicamos o contrato).
- Aplicar esse modo em pedidos PIX/loja (só recarga manual, como pedido).
- Pricing por workspace variável dentro do mesmo pedido — preço fixo por ws.
