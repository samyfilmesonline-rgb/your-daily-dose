Auditoria das regras vs. código atual:

Violações encontradas:

- **Regra 1/5 (nunca usar `canceled`)** — `partner-shop-multi-workspace-tick` ainda faz `finalStatus = "canceled"` quando há `stop_requested_at`. A migração `refund_order_remainder` que rodei agora também escreve `'canceled'` em alguns ramos. Precisa virar sempre `refunded` quando houver stop.
- **Regra 5 (limpar `current_workspace`/`target_workspace`)** — o tick não nula esses campos ao finalizar. A função SQL precisa nular também.
- **Regra 7 (stop só preenche `stop_requested_at`)** — eu havia mudado `partner-shop-stop-order` para chamar `refund_order_remainder` direto em multi-ws. Isso viola a regra. Precisa só marcar `stop_requested_at` e deixar o tick (ou watchdog) finalizar.
- **Regra 3 (action `fail` deve avançar quando não houver stop)** — atualmente o tick já avança no `fail` (vai para o próximo `pending`), então essa parte está ok. Mas convém deixar explícito que o `fail` com stop finaliza como `refunded`.
- **Regra 5 (`refund_partner_quota`)** — o tick chama `refund_order_remainder` (que internamente roteia para `refund_partner_quota` quando `is_manual = true`). Mantém esse caminho desde que a função SQL respeite tudo.

Plano de correção (sem tocar fluxo single-workspace):

1) Edge Function `partner-shop-multi-workspace-tick`
   - Trocar `finalStatus = "canceled"` por `finalStatus = "refunded"` quando `stopRequested`.
   - No payload de update final, sempre setar `current_workspace = null` e `target_workspace = null`.
   - Recalcular `workspaces_done` como `done + failed + skipped` (já é, mas garantir).
   - Manter chamada a `refund_order_remainder` (que já cuida de quota/saldo, libera bot e pausa programação) e `assign_next_queued_order`.
   - Garantir que o `action: "fail"` quando não há stop avança para o próximo `pending` (já avança, manter).
   - Garantir que o `action: "fail"` com stop marque pendentes como `skipped`, finalize como `refunded` e libere bot.

2) Edge Function `partner-shop-stop-order`
   - Para multi-workspace: NÃO chamar `refund_order_remainder` direto. Apenas preencher `stop_requested_at` e retornar `{ ok: true, immediate: false, refundedCredits: 0 }`.
   - Para single-workspace: manter o caminho legado (`stop_order_partial`).
   - O watchdog continua sendo a rede de segurança quando o worker está morto.

3) Função SQL `refund_order_remainder` (migração nova)
   - Remover qualquer atribuição de `'canceled'`. No ramo multi-workspace, terminal só pode ser:
     - `delivered` se `done_count >= total` e SEM stop.
     - `failed` se `done_count = 0` e SEM stop.
     - `refunded` em todo resto (qualquer stop OU done parcial).
   - Sempre setar `current_workspace = NULL`, `target_workspace = NULL` no UPDATE final do multi-ws.
   - Manter idempotência (já trata estados terminais).
   - Manter roteamento de refund: `is_manual` → `refund_partner_quota`; senão saldo do cliente.
   - Manter pausa da `partner_order_schedules` quando o pedido veio de uma programação e não terminou em `delivered`.

4) Watchdog `partner-shop-stalled-watchdog`
   - Continua chamando `refund_order_remainder` (agora 100% compatível com as regras). Sem mudança lógica adicional.

5) Validação
   - Conferir que enum `partner_order_status` aceita os valores listados (regra 1) — ok.
   - Não criar nem alterar triggers; apenas a função SQL.
   - Após mudanças, testar manualmente: parar pedido multi-ws → verificar `status = refunded`, `current_workspace = null`, `target_workspace = null`, bot `idle`.

Arquivos afetados:
- `supabase/functions/partner-shop-multi-workspace-tick/index.ts`
- `supabase/functions/partner-shop-stop-order/index.ts`
- 1 migração nova substituindo o corpo de `refund_order_remainder` (sem `canceled`, com cleanup de `current_workspace`/`target_workspace`).

Fora de escopo:
- Fluxo single-workspace.
- Triggers e outras tabelas.
- Loop de login do worker desktop (problema do app Python).