-- 1) Sticky bot finder
CREATE OR REPLACE FUNCTION public.find_sticky_bot_for_order(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.partner_credit_orders;
  v_preferred uuid;
  v_pref_status text;
  v_bot uuid;
  v_email text;
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id;
  IF v_order.id IS NULL THEN RETURN NULL; END IF;

  -- 1. preferredBotId in raw_payload
  v_preferred := NULLIF(v_order.raw_payload->'manualOrder'->>'preferredBotId','')::uuid;
  IF v_preferred IS NULL THEN
    v_preferred := NULLIF(v_order.raw_payload->>'preferredBotId','')::uuid;
  END IF;

  IF v_preferred IS NOT NULL THEN
    SELECT status::text INTO v_pref_status FROM public.farm_bots
     WHERE id = v_preferred AND partner_id = v_order.partner_id;
    IF v_pref_status = 'idle' THEN
      RETURN v_preferred;
    ELSIF v_pref_status = 'busy' THEN
      -- preferido existe mas ocupado -> aguarda; não cai no fallback
      RETURN NULL;
    END IF;
    -- disabled/inexistente: cai pra próxima estratégia
  END IF;

  IF v_order.target_workspace IS NOT NULL THEN
    -- 2. mais recente email_lovable usado para mesmo workspace por esse parceiro
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

      -- bot histórico existe mas não idle? aguarda
      IF EXISTS (
        SELECT 1 FROM public.farm_bots
         WHERE partner_id = v_order.partner_id
           AND email_lovable = v_email
           AND status = 'busy'
      ) THEN
        RETURN NULL;
      END IF;
    END IF;

    -- 3. bot do último pedido do mesmo cliente+workspace
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
      SELECT status::text INTO v_pref_status FROM public.farm_bots WHERE id = v_bot;
      IF v_pref_status = 'idle' THEN RETURN v_bot; END IF;
      IF v_pref_status = 'busy' THEN RETURN NULL; END IF;
      -- disabled/excluído -> fallback
    END IF;
  END IF;

  -- 4. fallback: qualquer idle
  SELECT id INTO v_bot
  FROM public.farm_bots
  WHERE partner_id = v_order.partner_id AND status = 'idle'
  ORDER BY COALESCE(last_heartbeat_at, created_at) ASC
  LIMIT 1;
  RETURN v_bot;
END $$;

-- 2) Atualiza assign_bot_to_order para usar sticky finder + claim atômico
CREATE OR REPLACE FUNCTION public.assign_bot_to_order(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid;
  v_bot uuid;
  v_claimed uuid;
BEGIN
  SELECT partner_id INTO v_partner FROM public.partner_credit_orders
   WHERE id = _order_id FOR UPDATE;
  IF v_partner IS NULL THEN RETURN NULL; END IF;

  v_bot := public.find_sticky_bot_for_order(_order_id);

  IF v_bot IS NULL THEN
    UPDATE public.partner_credit_orders SET status = 'queued' WHERE id = _order_id;
    RETURN NULL;
  END IF;

  -- claim atômico
  UPDATE public.farm_bots
     SET status = 'busy', current_order_id = _order_id
   WHERE id = v_bot AND status = 'idle'
  RETURNING id INTO v_claimed;

  IF v_claimed IS NULL THEN
    -- bot foi tomado entre find e claim: enfileira para retry pelo watchdog/queue
    UPDATE public.partner_credit_orders SET status = 'queued' WHERE id = _order_id;
    RETURN NULL;
  END IF;

  UPDATE public.partner_credit_orders
     SET status = 'processing',
         assigned_bot_id = v_claimed,
         assigned_at = now()
   WHERE id = _order_id;

  RETURN v_claimed;
END $$;

-- 3) Atualiza retry_manual_order para preservar bot original
CREATE OR REPLACE FUNCTION public.retry_manual_order(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.partner_credit_orders;
  v_bot_email text;
  v_already_farmed integer := 0;
  v_to_redebit integer := 0;
  v_since timestamptz;
  v_assigned_bot uuid;
  v_new_status text;
  v_partner_quota record;
  v_retries jsonb;
  v_retry_entry jsonb;
  v_preferred uuid;
  v_payload jsonb;
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF NOT v_order.is_manual THEN RAISE EXCEPTION 'Pedido não é manual'; END IF;
  IF v_order.status NOT IN ('refunded'::public.partner_order_status, 'failed'::public.partner_order_status) THEN
    RAISE EXCEPTION 'Status atual (%) não permite retry', v_order.status;
  END IF;
  IF v_order.delivered_at IS NOT NULL THEN RAISE EXCEPTION 'Pedido já entregue'; END IF;

  IF v_order.assigned_bot_id IS NOT NULL THEN
    SELECT email_lovable INTO v_bot_email FROM public.farm_bots WHERE id = v_order.assigned_bot_id;
  END IF;
  v_since := COALESCE(v_order.assigned_at, v_order.paid_at);
  IF v_bot_email IS NOT NULL AND v_order.target_workspace IS NOT NULL THEN
    SELECT COALESCE(SUM(creditos_adicionados), 0)::int INTO v_already_farmed
    FROM public.execucoes_lovable
    WHERE id_do_usuario = v_order.partner_id
      AND email_lovable = v_bot_email
      AND workspace_nome = v_order.target_workspace
      AND (v_since IS NULL OR iniciado_em >= v_since);
  END IF;

  v_to_redebit := v_order.credits - v_already_farmed - COALESCE(v_order.balance_applied_credits, 0);
  IF v_to_redebit <= 0 THEN RAISE EXCEPTION 'Nada a re-debitar (já entregue na prática)'; END IF;

  SELECT limite_creditos, creditos_consumidos INTO v_partner_quota
  FROM public.parceiros WHERE user_id = v_order.partner_id FOR UPDATE;
  IF v_partner_quota.creditos_consumidos + v_to_redebit > v_partner_quota.limite_creditos THEN
    RAISE EXCEPTION 'Limite de créditos do parceiro insuficiente (restam %)',
      GREATEST(0, v_partner_quota.limite_creditos - v_partner_quota.creditos_consumidos);
  END IF;

  PERFORM public.debit_partner_quota(v_order.partner_id, v_to_redebit, _order_id, 'manual_retry');

  v_preferred := v_order.assigned_bot_id;

  v_retries := COALESCE(v_order.raw_payload->'manualOrder'->'retries', '[]'::jsonb);
  v_retry_entry := jsonb_build_object(
    'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'previous_failed_reason', v_order.failed_reason,
    'previous_assigned_bot_id', v_order.assigned_bot_id,
    'redebited', v_to_redebit
  );
  v_retries := v_retries || jsonb_build_array(v_retry_entry);

  v_payload := COALESCE(v_order.raw_payload, '{}'::jsonb);
  v_payload := jsonb_set(v_payload, '{manualOrder,retries}', v_retries, true);
  IF v_preferred IS NOT NULL THEN
    v_payload := jsonb_set(v_payload, '{manualOrder,preferredBotId}', to_jsonb(v_preferred::text), true);
  END IF;

  UPDATE public.partner_credit_orders
     SET status = 'paid'::public.partner_order_status,
         assigned_bot_id = NULL,
         assigned_at = NULL,
         failed_reason = NULL,
         stop_requested_at = NULL,
         refunded_credits = 0,
         bot_invite_confirmed_at = now(),
         bot_invite_confirmed_fingerprint = COALESCE(bot_invite_confirmed_fingerprint, 'manual'),
         raw_payload = v_payload,
         updated_at = now()
   WHERE id = _order_id;

  v_assigned_bot := public.assign_bot_to_order(_order_id);
  SELECT status::text INTO v_new_status FROM public.partner_credit_orders WHERE id = _order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_new_status,
    'assignedBotId', v_assigned_bot,
    'preferredBotId', v_preferred,
    'redebited', v_to_redebit
  );
END $$;

-- 4) assign_next_queued_order: priorizar pedidos cujo preferredBotId é o bot recém-liberado
CREATE OR REPLACE FUNCTION public.assign_next_queued_order(_partner_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order uuid;
  v_idle_bot uuid;
BEGIN
  -- pega um bot idle do parceiro (qualquer)
  SELECT id INTO v_idle_bot FROM public.farm_bots
   WHERE partner_id = _partner_id AND status = 'idle'
   ORDER BY COALESCE(last_heartbeat_at, created_at) ASC
   LIMIT 1;

  -- 1. tenta pedido queued cujo preferredBotId aponta para algum bot idle desse parceiro
  SELECT o.id INTO v_order
  FROM public.partner_credit_orders o
  WHERE o.partner_id = _partner_id
    AND o.status = 'queued'
    AND (
      EXISTS (
        SELECT 1 FROM public.farm_bots b
        WHERE b.partner_id = _partner_id
          AND b.status = 'idle'
          AND (
            b.id::text = COALESCE(o.raw_payload->'manualOrder'->>'preferredBotId', '')
            OR b.id::text = COALESCE(o.raw_payload->>'preferredBotId', '')
          )
      )
    )
  ORDER BY o.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- 2. caso não haja, FIFO normal
  IF v_order IS NULL THEN
    SELECT id INTO v_order FROM public.partner_credit_orders
     WHERE partner_id = _partner_id AND status = 'queued'
     ORDER BY created_at ASC LIMIT 1
     FOR UPDATE SKIP LOCKED;
  END IF;

  IF v_order IS NULL THEN RETURN NULL; END IF;
  PERFORM public.assign_bot_to_order(v_order);
  RETURN v_order;
END $$;