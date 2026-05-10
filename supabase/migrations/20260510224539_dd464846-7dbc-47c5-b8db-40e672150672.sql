CREATE OR REPLACE FUNCTION public.retry_manual_order(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_per_ws constant integer := 200;
  v_plan jsonb;
  v_new_plan jsonb := '[]'::jsonb;
  v_item jsonb;
  v_to_retry int := 0;
  v_done_count int := 0;
  v_first_pending text := NULL;
  v_idx int := 0;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF NOT v_order.is_manual THEN RAISE EXCEPTION 'Pedido não é manual'; END IF;
  IF v_order.status NOT IN ('refunded'::public.partner_order_status, 'failed'::public.partner_order_status) THEN
    RAISE EXCEPTION 'Status atual (%) não permite retry', v_order.status;
  END IF;
  IF v_order.delivered_at IS NOT NULL THEN RAISE EXCEPTION 'Pedido já entregue'; END IF;

  -- =========================================================
  -- MULTI-WORKSPACE PATH
  -- =========================================================
  IF v_order.multi_workspace_mode THEN
    v_plan := COALESCE(v_order.workspaces_plan, '[]'::jsonb);
    IF jsonb_array_length(v_plan) = 0 THEN
      RAISE EXCEPTION 'Pedido multi-workspace sem plano para refazer';
    END IF;

    -- rebuild plan: keep done as-is; reset failed/skipped/pending/running -> pending.
    -- The first pending becomes 'running' so the worker knows where to start.
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
      IF (v_item->>'status') = 'done' THEN
        v_new_plan := v_new_plan || jsonb_build_array(v_item);
        v_done_count := v_done_count + 1;
      ELSE
        IF v_first_pending IS NULL THEN
          v_first_pending := v_item->>'name';
          v_new_plan := v_new_plan || jsonb_build_array(jsonb_build_object(
            'name', v_item->>'name',
            'status', 'running',
            'farmed', 0,
            'started_at', to_jsonb(v_now),
            'finished_at', NULL,
            'error', NULL
          ));
        ELSE
          v_new_plan := v_new_plan || jsonb_build_array(jsonb_build_object(
            'name', v_item->>'name',
            'status', 'pending',
            'farmed', 0,
            'started_at', NULL,
            'finished_at', NULL,
            'error', NULL
          ));
        END IF;
        v_to_retry := v_to_retry + 1;
      END IF;
    END LOOP;

    IF v_to_retry = 0 THEN
      RAISE EXCEPTION 'Nada a refazer — todos os workspaces já estão concluídos';
    END IF;

    v_to_redebit := v_to_retry * v_per_ws;

    SELECT limite_creditos, creditos_consumidos INTO v_partner_quota
    FROM public.parceiros WHERE user_id = v_order.partner_id FOR UPDATE;
    IF v_partner_quota.creditos_consumidos + v_to_redebit > v_partner_quota.limite_creditos THEN
      RAISE EXCEPTION 'Limite de créditos do parceiro insuficiente (restam %)',
        GREATEST(0, v_partner_quota.limite_creditos - v_partner_quota.creditos_consumidos);
    END IF;

    PERFORM public.debit_partner_quota(v_order.partner_id, v_to_redebit, _order_id, 'manual_retry_multi_ws');

    v_preferred := v_order.assigned_bot_id;

    v_retries := COALESCE(v_order.raw_payload->'manualOrder'->'retries', '[]'::jsonb);
    v_retry_entry := jsonb_build_object(
      'at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'previous_failed_reason', v_order.failed_reason,
      'previous_assigned_bot_id', v_order.assigned_bot_id,
      'redebited', v_to_redebit,
      'workspacesToRetry', v_to_retry,
      'multiWorkspace', true
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
           current_workspace = v_first_pending,
           target_workspace = v_first_pending,
           failed_reason = NULL,
           stop_requested_at = NULL,
           refunded_credits = 0,
           workspaces_plan = v_new_plan,
           workspaces_done = v_done_count,
           bot_invite_confirmed_at = now(),
           bot_invite_confirmed_fingerprint = COALESCE(bot_invite_confirmed_fingerprint, 'manual'),
           raw_payload = v_payload,
           updated_at = now()
     WHERE id = _order_id;

    -- atribui bot (mesmo padrão do single-ws)
    v_assigned_bot := public.assign_bot_to_order(_order_id);
    SELECT status::text INTO v_new_status FROM public.partner_credit_orders WHERE id = _order_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', v_new_status,
      'assignedBotId', v_assigned_bot,
      'preferredBotId', v_preferred,
      'multiWorkspace', true,
      'redebited', v_to_redebit,
      'workspacesToRetry', v_to_retry,
      'workspacesDone', v_done_count,
      'currentWorkspace', v_first_pending
    );
  END IF;

  -- =========================================================
  -- SINGLE-WORKSPACE PATH (preservado)
  -- =========================================================
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
END $function$;

REVOKE EXECUTE ON FUNCTION public.retry_manual_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_manual_order(uuid) TO service_role;