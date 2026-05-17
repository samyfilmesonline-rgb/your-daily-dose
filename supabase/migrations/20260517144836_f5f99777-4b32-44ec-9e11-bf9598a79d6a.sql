-- 1) Liberar bots travados apontando para pedidos finalizados/inexistentes
UPDATE public.farm_bots b
   SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now(), updated_at = now()
 WHERE b.status = 'busy'
   AND (
        b.current_order_id IS NULL
     OR NOT EXISTS (
          SELECT 1 FROM public.partner_credit_orders o
           WHERE o.id = b.current_order_id
             AND o.status IN ('paid','queued','processing','waiting_invite','waiting_workspace')
        )
   );

-- 2) Corrigir find_sticky_bot_for_order: tratar bot 'busy' com pedido morto como liberável
CREATE OR REPLACE FUNCTION public.find_sticky_bot_for_order(_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.partner_credit_orders;
  v_preferred uuid;
  v_pref_status text;
  v_pref_current uuid;
  v_pref_order_active boolean;
  v_bot uuid;
  v_email text;
  v_bot_current uuid;
  v_bot_order_active boolean;
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id;
  IF v_order.id IS NULL THEN RETURN NULL; END IF;

  v_preferred := COALESCE(
    NULLIF(v_order.raw_payload->'manualOrder'->>'preferredBotId','')::uuid,
    NULLIF(v_order.raw_payload->'manualOrder'->>'requestedBotId','')::uuid,
    NULLIF(v_order.raw_payload->>'preferredBotId','')::uuid,
    NULLIF(v_order.raw_payload->>'requestedBotId','')::uuid
  );

  IF v_preferred IS NOT NULL THEN
    SELECT status::text, current_order_id INTO v_pref_status, v_pref_current
      FROM public.farm_bots
     WHERE id = v_preferred AND partner_id = v_order.partner_id;
    IF v_pref_status = 'idle' THEN
      RETURN v_preferred;
    ELSIF v_pref_status = 'busy' THEN
      -- Se o pedido atual do bot já terminou (ou sumiu), libera o bot
      v_pref_order_active := v_pref_current IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.partner_credit_orders o
         WHERE o.id = v_pref_current
           AND o.status IN ('paid','queued','processing','waiting_invite','waiting_workspace')
      );
      IF NOT v_pref_order_active THEN
        UPDATE public.farm_bots
           SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now(), updated_at = now()
         WHERE id = v_preferred;
        RETURN v_preferred;
      END IF;
      RETURN NULL;
    END IF;
  END IF;

  IF v_order.target_workspace IS NOT NULL THEN
    SELECT e.email_lovable INTO v_email
    FROM public.execucoes_lovable e
    WHERE e.id_do_usuario = v_order.partner_id
      AND e.workspace_nome = v_order.target_workspace
    ORDER BY e.iniciado_em DESC
    LIMIT 1;

    IF v_email IS NOT NULL THEN
      SELECT id INTO v_bot FROM public.farm_bots
       WHERE partner_id = v_order.partner_id
         AND email_lovable = v_email
         AND status = 'idle'
       LIMIT 1;
      IF v_bot IS NOT NULL THEN RETURN v_bot; END IF;

      -- Bot histórico existe mas está busy: verifica se pedido dele ainda é ativo
      SELECT id, current_order_id INTO v_bot, v_bot_current
        FROM public.farm_bots
       WHERE partner_id = v_order.partner_id
         AND email_lovable = v_email
         AND status = 'busy'
       LIMIT 1;
      IF v_bot IS NOT NULL THEN
        v_bot_order_active := v_bot_current IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.partner_credit_orders o
           WHERE o.id = v_bot_current
             AND o.status IN ('paid','queued','processing','waiting_invite','waiting_workspace')
        );
        IF NOT v_bot_order_active THEN
          UPDATE public.farm_bots
             SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now(), updated_at = now()
           WHERE id = v_bot;
          RETURN v_bot;
        END IF;
        RETURN NULL;
      END IF;
    END IF;

    -- Bot do último pedido do mesmo cliente+workspace
    SELECT o.assigned_bot_id INTO v_bot
    FROM public.partner_credit_orders o
    WHERE o.partner_id = v_order.partner_id
      AND lower(o.customer_email) = lower(v_order.customer_email)
      AND o.target_workspace = v_order.target_workspace
      AND o.assigned_bot_id IS NOT NULL
      AND o.id <> v_order.id
    ORDER BY o.created_at DESC
    LIMIT 1;

    IF v_bot IS NOT NULL THEN
      SELECT status::text, current_order_id INTO v_pref_status, v_bot_current
        FROM public.farm_bots WHERE id = v_bot;
      IF v_pref_status = 'idle' THEN RETURN v_bot; END IF;
      IF v_pref_status = 'busy' THEN
        v_bot_order_active := v_bot_current IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.partner_credit_orders o
           WHERE o.id = v_bot_current
             AND o.status IN ('paid','queued','processing','waiting_invite','waiting_workspace')
        );
        IF NOT v_bot_order_active THEN
          UPDATE public.farm_bots
             SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now(), updated_at = now()
           WHERE id = v_bot;
          RETURN v_bot;
        END IF;
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  -- Fallback: qualquer bot idle do parceiro
  SELECT id INTO v_bot
  FROM public.farm_bots
  WHERE partner_id = v_order.partner_id AND status = 'idle'
  ORDER BY COALESCE(last_heartbeat_at, created_at) ASC
  LIMIT 1;
  RETURN v_bot;
END $function$;

-- 3) Reatribuir o pedido que estava preso na fila do parceiro
SELECT public.assign_next_queued_order('1dc707a3-c9dd-4b0a-91f8-24f264eee0b6'::uuid);