## Objetivo

Quando um workspace retornar `workspace_ineligible:` (após 3 tentativas de PRO/downgrade no worker), o pedido multi-workspace deve marcar aquele item como inapto/pulado, avançar automaticamente para o próximo `pending`, e exibir corretamente no painel — sem travar em "Aguardando worker iniciar" e sem usar status `canceled`.

## Mudanças

### 1. Edge Function `partner-shop-multi-workspace-tick` (ajustes pontuais)

Manter a estrutura atual (start/next/fail). Ajustes:

- **`action: "fail"`**: já marca `plan[idx].status = 'failed'` e grava `plan[idx].error = b.reason`. Garantir que mensagens iniciadas por `workspace_ineligible:` são preservadas tal como vieram do worker (sem normalização). Após o fail, a lógica compartilhada já promove o próximo `pending` para `running` e atualiza `current_workspace` / `target_workspace` / `workspaces_done`. Confirmar que isso também ocorre quando o erro é `workspace_ineligible:` (nada a alterar nesse ponto, só garantir nos testes).
- **Status final** (regra atualizada conforme pedido):
  - `stopRequested` → `refunded` (mantém)
  - `doneCount === 0` → `failed`
  - `doneCount >= 1` → `delivered` (NOVO: hoje cai em `refunded` quando há mistura done+failed; passar a tratar qualquer sucesso parcial como `delivered`)
  - Continuar chamando `refund_order_remainder` para devolver créditos não usados, independentemente do status final
  - Continuar limpando `current_workspace = null` / `target_workspace = null` ao finalizar
  - Nunca emitir `canceled`
- Nenhuma mudança em quota, debit, schedule ou liberação de bot.

### 2. Frontend `src/pages/dashboard/Pedidos.tsx` (lista de workspaces no detalhe)

No bloco que renderiza `detail.workspaces_plan` (linhas 444–474):

- Adicionar tipo `'skipped'` ao item.
- Detectar `ineligible` quando `w.status === 'failed'` e `w.error?.startsWith('workspace_ineligible:')`.
- Mapa de label/cor:
  - `done` → "concluído", `text-primary`
  - `running` → "em andamento", `text-amber-400`
  - `pending` → "aguardando", `text-muted-foreground`
  - `failed` ineligible → "inapto · pulado", `text-amber-500` (badge informativo, não destrutivo)
  - `failed` comum → "falhou", `text-destructive` (mostrar tooltip/title com `w.error`)
  - `skipped` → "ignorado", `text-muted-foreground`
- Mostrar `w.error` como `title` no item quando houver, para inspeção rápida.
- Atualizar o cabeçalho do bloco para contar finalizados (done+failed+skipped) sobre o total — já é o que `workspaces_done` representa após a edge atualizar.

### 3. Mensagem "Aguardando worker iniciar"

Localizar a string que mostra esse aviso (não foi vista no trecho lido — confirmar local em `Pedidos.tsx`/cards de progresso) e:

- No modo multi-workspace, considerar que o worker já iniciou quando `workspaces_total != null` OU existe algum item em `workspaces_plan` com `status !== 'pending'`. Nesse caso não exibir mais o aviso.
- Continuar mostrando para single-workspace conforme hoje.

### 4. Tipos

Atualizar a tipagem local de `workspaces_plan` em `Pedidos.tsx` para incluir `'skipped'` e o campo `error: string | null`.

## Não-mexer

- Worker desktop Python.
- Fluxo single-workspace (`partner-shop-check-status`, `retry_manual_order` single, etc.).
- Enum `partner_order_status` no banco (continua sem `canceled`; finalização manual usa `refunded`).
- Triggers/migrations existentes que limpam `current_workspace`/`target_workspace` em estados terminais.

## Verificação

- Pedido com 3 workspaces, 1º retorna `workspace_ineligible:no_pro_button` via `action=fail`: 2º vira `running`, painel mostra 1º como "inapto · pulado", contador 1/3 → ao fim, se 2º e 3º entregam, status `delivered`; se ambos falharem também, `failed`.
- Pedido parado manualmente: status `refunded`, restantes `skipped`.
- Aviso "Aguardando worker iniciar" some assim que `workspaces_total` é preenchido pelo `start`.
