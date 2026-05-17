## Causa raiz

A migração recente adicionou os status `waiting_workspace` e `waiting_invite` ao enum `partner_order_status`. O backend (`partner-shop-check-status`) já devolve esses status corretamente — eu confirmei direto no banco:

- Pedido `09101730…` (o que você acabou de pagar): `status = waiting_invite`, `assigned_bot_id` presente, `target_workspace = 'PRO 04'`, `bot_invite_confirmed_at = null`, `failed_reason = "Aguardando cliente clicar em 'Ja adicionei o bot como Owner'."`

Ou seja: o pagamento foi confirmado, um bot foi atribuído, e o backend está corretamente esperando você confirmar o convite. **O problema é só no frontend** `src/pages/ComprarParceiro.tsx`:

1. `OrderStatus` (linha 54) só conhece `pending|paid|queued|processing|delivered|failed|expired|refunded` — falta `waiting_workspace` e `waiting_invite`.
2. `showBotBlock` (linha 2147) exige `status === "processing" || "paid" || "queued"`. Como o status agora é `waiting_invite`, o bloco com o e-mail do bot + botão "Já adicionei o bot como Owner" **nunca renderiza**.
3. Por isso o usuário cai no fallback "Estamos preparando seu pedido…" (linha 2225) e nunca consegue copiar o e-mail nem confirmar o convite.
4. `STATUS_LABEL` também não tem entrada para os novos status, por isso o campo "Status" aparece vazio no card (igual à sua screenshot).

## Mudanças (somente em `src/pages/ComprarParceiro.tsx`)

1. **Expandir o tipo `OrderStatus`** para incluir `"waiting_workspace"` e `"waiting_invite"`.

2. **Atualizar `STATUS_LABEL`**:
   - `waiting_workspace`: "Falta informar o workspace"
   - `waiting_invite`: "Falta confirmar bot como Owner"

3. **Atualizar `statusHeadline`** para devolver títulos úteis nesses estados (ex.: "Adicione o bot como Owner no seu workspace").

4. **Atualizar `showBotBlock`** para incluir `waiting_invite` na lista de status que renderizam o painel com:
   - e-mail do bot + botão "Copiar"
   - passo-a-passo de convidar como Owner
   - botão "Já adicionei o bot como Owner" (que chama `partner-shop-confirm-invite`)
   
   Esse painel já existe (linhas 2328–2370); só não está sendo mostrado porque a condição está desatualizada.

5. **Adicionar bloco para `waiting_workspace`** (pedido pago mas sem workspace alvo — caso do `cb71f332`):
   - input + botão "Salvar workspace" que chama a edge function `partner-shop-set-target-workspace` (já existe e já tem validação contra rótulos de status como "Em andamento").
   - mensagem clara: "Pagamento confirmado. Informe o nome exato do seu workspace Lovable para iniciarmos."

6. **Ajustar a condição amber "Estamos preparando seu pedido. Se demorar, fale com o suporte."** (linha 2371) para **não** renderizar quando o status for `waiting_invite` ou `waiting_workspace` — esses casos têm bloco próprio acima.

7. **Atualizar as transições de `step`** (linhas 421 e 1201) que assumem `d.status !== "pending"` ⇒ "paid". Continuam funcionando, mas garantir que `waiting_invite`/`waiting_workspace` também avancem o step para "paid".

## Fora do escopo

- Backend: a edge function `partner-shop-check-status` e as RPCs já devolvem e tratam os novos status corretamente. Nada a mudar lá.
- A página admin `Pedidos.tsx` já foi atualizada nas mensagens anteriores.
- O fluxo de atribuição de bot está funcionando (o bot foi atribuído com sucesso ao seu último pedido).

## Critérios de aceite

- Após pagar o Pix, o cliente vê imediatamente (ou no próximo poll) o painel com o e-mail do bot e o botão "Já adicionei o bot como Owner".
- Clicar no botão chama `partner-shop-confirm-invite` e a tela passa para "Convite confirmado — iniciando farm".
- O pedido `09101730…` que está travado em `waiting_invite` agora exibe o painel correto quando você reabrir a tela.
- Pedidos `waiting_workspace` (como `cb71f332`) mostram um input para o cliente informar o workspace.
- O campo "Status" no card nunca aparece vazio.
