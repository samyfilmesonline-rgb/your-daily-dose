---
name: Workspace 20/24h cooldown
description: Cada workspace só recebe até 20 créditos a cada 24h (rolling, global). Pedidos excedentes são reagendados automaticamente.
type: feature
---
Regra global enforçada server-side em todas as funções que criam/avançam pedidos:

- **Helpers SQL** `public.workspace_cooldown_until(name)` e `public.workspace_farmed_last_24h(name)` (migration 20260605).
- **Constante** `PER_WORKSPACE_DAILY_CAP = 20` em `supabase/functions/_shared/limits.ts`. Multi-ws usa essa mesma constante (`PER_WS`).
- **Quando o workspace está em cooldown**, a função não cria a order imediata; cria um `partner_order_schedules` one-shot com `start_at = cooldown_until` via `createCooldownSchedule()` e devolve `{ scheduled: true, scheduledFor }`.
- **Funções afetadas**: `partner-shop-create-pix`, `partner-shop-redeem-balance`, `partner-shop-create-balance-only-order`, `partner-shop-create-manual-order` (single mode), `partner-shop-multi-workspace-tick` (start/next), `partner-shop-schedule-tick`.
- **Frontend**: `ComprarParceiro.tsx` e `ManualOrderDialog.tsx` exibem toast "Workspace em cooldown 20/24h — pedido agendado para HH:MM".
- Pedidos single com `credits > 20` são rejeitados nas funções de checkout (UI deve oferecer só pacotes ≤ 20).