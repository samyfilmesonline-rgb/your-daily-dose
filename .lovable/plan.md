## Causa raiz

O pedido `09101730…` está com:
- `status = paid` (esperado: `processing`)
- `assigned_bot_id = acc4d4c2…` ✓
- `target_workspace = 'PRO 04'` ✓
- `bot_invite_confirmed_at = 2026-05-17 14:25:08` ✓

E o bot `acc4d4c2…` está com `status = idle`, `current_order_id = NULL`.

Todas as 4 condições para iniciar o farm estão satisfeitas, mas o worker não pega o pedido porque:

1. **Status ficou em `paid` em vez de `processing`.** Quando o cliente clicou em "Já adicionei o bot como Owner", a função SQL `confirm_bot_invite` transicionou de `waiting_invite` → `paid`. Em seguida, ela só chama `assign_bot_to_order` quando `assigned_bot_id IS NULL`. Como o bot já estava pré-atribuído na fase `waiting_invite`, o `IF` não disparou, e o pedido nunca subiu para `processing`.
2. **O bot foi marcado como `idle` (provavelmente pelo watchdog ao detectar bot ocioso).** O `current_order_id` foi limpo. Sem isso, o worker não enxerga o vínculo.

Resultado: pedido pago + bot atribuído + workspace + convite confirmado, mas nada acontece.

## Mudanças

### 1. Migração SQL — corrigir `confirm_bot_invite`

Quando estiver transicionando para `paid` com bot atribuído e workspace presente, promover direto para `processing` e reclamar o bot:

```sql
CREATE OR REPLACE FUNCTION public.confirm_bot_invite(_order_id uuid, _fingerprint text)
... (mesma assinatura) ...
-- após o UPDATE que seta status = v_new_status:
IF v_new_status = 'paid' AND v_order.assigned_bot_id IS NULL THEN
  PERFORM public.assign_bot_to_order(_order_id);
ELSIF v_new_status = 'paid'
   AND v_order.assigned_bot_id IS NOT NULL
   AND v_order.target_workspace IS NOT NULL
   AND length(btrim(v_order.target_workspace)) > 0 THEN
  -- Reclamar o bot e promover para processing
  UPDATE public.farm_bots
     SET status = 'busy', current_order_id = _order_id, last_heartbeat_at = now()
   WHERE id = v_order.assigned_bot_id
     AND (status = 'idle' OR current_order_id = _order_id OR current_order_id IS NULL);
  UPDATE public.partner_credit_orders
     SET status = 'processing', assigned_at = COALESCE(assigned_at, now()), updated_at = now()
   WHERE id = _order_id;
END IF;
```

### 2. One-shot dentro da mesma migração — destravar o pedido `09101730…`

```sql
UPDATE public.farm_bots
   SET status = 'busy', current_order_id = '09101730-cc69-43b6-a9ab-34c9f4cd3158',
       last_heartbeat_at = now()
 WHERE id = 'acc4d4c2-0678-482d-b288-c2b6641b3491';
UPDATE public.partner_credit_orders
   SET status = 'processing', assigned_at = COALESCE(assigned_at, now()),
       failed_reason = NULL, updated_at = now()
 WHERE id = '09101730-cc69-43b6-a9ab-34c9f4cd3158' AND status = 'paid';
```

(Limpa o `failed_reason` "Aguardando cliente clicar…" que ficou stale.)

## Fora do escopo

- Frontend: nada a mudar — assim que o pedido virar `processing`, o painel de progresso já renderiza (essa parte já está pronta em `OrderTrackingInline`).
- Edge function `partner-shop-confirm-invite`: continua igual; só chama a RPC.
- `assign_bot_to_order`: continua igual; ela já bloqueia bots em estado de espera corretamente.

## Critérios de aceite

- Após a migração, o pedido `09101730…` aparece em `processing` e o worker inicia o farm em até 1 ciclo.
- Para qualquer pedido futuro: clicar em "Já adicionei o bot como Owner" leva o pedido direto para `processing` quando bot + workspace já estão definidos.
