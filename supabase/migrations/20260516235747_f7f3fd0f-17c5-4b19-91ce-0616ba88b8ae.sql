
-- 1) Novas colunas
ALTER TABLE public.partner_credit_orders
  ADD COLUMN IF NOT EXISTS workspaces_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_workspace text;

-- 2) refund_order_remainder: snapshot do parcial antes de marcar skipped + preserva last_workspace
CREATE OR REPLACE FUNCTION public.refund_order_remainder(_order_id uuid, _reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.partner_credit_orders%ROWTYPE;
  v_bot_email text;
  v_farmed integer := 0;
  v_remainder integer := 0;
  v_since timestamptz;
  v_plan jsonb;
  v_done_count int := 0;
  v_failed_count int := 0;
  v_skipped_count int := 0;
  v_total int := 0;
  v_price int := 0;
  v_stop boolean := false;
  v_final_status public.partner_order_status;
  v_partial int;
  v_started timestamptz;
  v_last_ws text;
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF v_order.status IN ('refunded','expired','delivered','failed') THEN
    IF v_order.assigned_bot_id IS NOT NULL THEN
      UPDATE public.farm_bots
         SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now()
       WHERE id = v_order.assigned_bot_id AND current_order_id = _order_id;
    END IF;
    RETURN COALESCE(v_order.refunded_credits, 0);
  END IF;

  IF v_order.assigned_bot_id IS NOT NULL THEN
    SELECT email_lovable INTO v_bot_email FROM public.farm_bots WHERE id = v_order.assigned_bot_id;
  END IF;

  v_since := COALESCE(v_order.assigned_at, v_order.paid_at);
  v_stop := v_order.stop_requested_at IS NOT NULL;
  v_last_ws := v_order.current_workspace;

  -- MULTI-WORKSPACE
  IF v_order.multi_workspace_mode THEN
    v_plan := COALESCE(v_order.workspaces_plan, '[]'::jsonb);
    v_total := COALESCE(v_order.workspaces_total, jsonb_array_length(v_plan));
    v_price := COALESCE(v_order.price_cents_per_workspace, 0);

    -- Snapshot parcial: para cada workspace 'running' ou 'pending' com started_at, soma execucoes
    IF v_bot_email IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(
        CASE
          WHEN (w->>'status') IN ('running','pending') THEN (
            SELECT
              CASE
                WHEN (w->>'started_at') IS NOT NULL THEN
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(w, '{status}', '"skipped"'),
                      '{finished_at}', to_jsonb(now())
                    ),
                    '{farmed}',
                    to_jsonb(GREATEST(
                      COALESCE((w->>'farmed')::int, 0),
                      COALESCE((
                        SELECT SUM(creditos_adicionados)::int
                        FROM public.execucoes_lovable
                        WHERE id_do_usuario = v_order.partner_id
                          AND email_lovable = v_bot_email
                          AND workspace_nome = (w->>'name')
                          AND iniciado_em >= (w->>'started_at')::timestamptz
                      ), 0)
                    ))
                  )
                ELSE jsonb_set(jsonb_set(w, '{status}', '"skipped"'), '{finished_at}', to_jsonb(now()))
              END
          )
          ELSE w
        END
      ), '[]'::jsonb)
      INTO v_plan
      FROM jsonb_array_elements(COALESCE(v_order.workspaces_plan, '[]'::jsonb)) w;
    ELSE
      -- sem bot conhecido: só marca skipped
      SELECT COALESCE(jsonb_agg(
        CASE
          WHEN (w->>'status') IN ('pending','running')
            THEN jsonb_set(jsonb_set(w, '{status}', '"skipped"'), '{finished_at}', to_jsonb(now()))
          ELSE w
        END
      ), '[]'::jsonb)
      INTO v_plan
      FROM jsonb_array_elements(COALESCE(v_order.workspaces_plan, '[]'::jsonb)) w;
    END IF;

    -- Soma farmed de todos os workspaces (done OU parcial gravado)
    SELECT COALESCE(SUM((w->>'farmed')::int), 0)
      INTO v_farmed
      FROM jsonb_array_elements(v_plan) w;

    SELECT
      COUNT(*) FILTER (WHERE (w->>'status') = 'done'),
      COUNT(*) FILTER (WHERE (w->>'status') = 'failed'),
      COUNT(*) FILTER (WHERE (w->>'status') = 'skipped')
      INTO v_done_count, v_failed_count, v_skipped_count
      FROM jsonb_array_elements(v_plan) w;

    v_remainder := GREATEST(COALESCE(v_order.credits, 0) - v_farmed, 0);

    IF v_order.paid_at IS NULL AND COALESCE(v_order.balance_applied_credits,0) = 0 AND NOT v_order.is_manual THEN
      UPDATE public.partner_credit_orders
         SET status = 'expired',
             failed_reason = COALESCE(_reason, failed_reason),
             workspaces_plan = v_plan,
             workspaces_done = v_done_count + v_failed_count + v_skipped_count,
             last_workspace = COALESCE(v_last_ws, last_workspace),
             current_workspace = NULL,
             target_workspace = NULL,
             updated_at = now()
       WHERE id = _order_id;
      IF v_order.assigned_bot_id IS NOT NULL THEN
        UPDATE public.farm_bots
           SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now()
         WHERE id = v_order.assigned_bot_id AND current_order_id = _order_id;
      END IF;
      RETURN 0;
    END IF;

    IF v_remainder > 0 THEN
      IF v_order.is_manual THEN
        PERFORM public.refund_partner_quota(v_order.partner_id, v_remainder, _order_id, COALESCE(_reason,'manual_refund_multi'));
      ELSE
        INSERT INTO public.partner_customer_balances (partner_id, customer_email, client_fingerprint, credits)
        VALUES (v_order.partner_id, lower(v_order.customer_email), v_order.client_fingerprint, v_remainder)
        ON CONFLICT (partner_id, customer_email)
        DO UPDATE SET credits = public.partner_customer_balances.credits + EXCLUDED.credits,
                      client_fingerprint = COALESCE(public.partner_customer_balances.client_fingerprint, EXCLUDED.client_fingerprint),
                      updated_at = now();

        INSERT INTO public.partner_credit_ledger (partner_id, customer_email, order_id, delta, reason)
        VALUES (v_order.partner_id, lower(v_order.customer_email), _order_id, v_remainder, COALESCE(_reason,'refund_multi'));
      END IF;
    END IF;

    IF v_stop THEN
      v_final_status := 'refunded'::public.partner_order_status;
    ELSIF v_done_count = 0 THEN
      v_final_status := 'failed'::public.partner_order_status;
    ELSIF v_done_count >= COALESCE(v_total, v_done_count) THEN
      v_final_status := 'delivered'::public.partner_order_status;
    ELSE
      v_final_status := 'refunded'::public.partner_order_status;
    END IF;

    UPDATE public.partner_credit_orders
       SET status = v_final_status,
           workspaces_plan = v_plan,
           workspaces_done = v_done_count + v_failed_count + v_skipped_count,
           refunded_credits = v_remainder,
           amount_cents = CASE WHEN v_price > 0 THEN v_done_count * v_price ELSE amount_cents END,
           credits = v_farmed,
           last_workspace = COALESCE(v_last_ws, last_workspace),
           current_workspace = NULL,
           target_workspace = NULL,
           delivered_at = CASE WHEN v_final_status = 'delivered' THEN now() ELSE delivered_at END,
           failed_reason = CASE WHEN v_final_status = 'delivered' THEN NULL ELSE COALESCE(_reason, failed_reason) END,
           updated_at = now()
     WHERE id = _order_id;

    IF v_order.assigned_bot_id IS NOT NULL THEN
      UPDATE public.farm_bots
         SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now()
       WHERE id = v_order.assigned_bot_id AND current_order_id = _order_id;
    END IF;

    IF v_order.schedule_id IS NOT NULL AND v_final_status <> 'delivered' THEN
      UPDATE public.partner_order_schedules
         SET status = 'paused',
             runs_failed = COALESCE(runs_failed,0) + 1,
             last_run_at = now(),
             updated_at = now()
       WHERE id = v_order.schedule_id AND status = 'active';
    END IF;

    PERFORM public.assign_next_queued_order(v_order.partner_id);

    RETURN v_remainder;
  END IF;

  -- SINGLE-WORKSPACE (inalterado)
  IF v_bot_email IS NOT NULL AND v_order.target_workspace IS NOT NULL THEN
    SELECT COALESCE(SUM(creditos_adicionados), 0)::int INTO v_farmed
      FROM public.execucoes_lovable
     WHERE id_do_usuario = v_order.partner_id
       AND email_lovable = v_bot_email
       AND workspace_nome = v_order.target_workspace
       AND (v_since IS NULL OR iniciado_em >= v_since);
  END IF;

  v_remainder := GREATEST(COALESCE(v_order.credits,0) - v_farmed, 0);

  IF v_order.paid_at IS NULL AND COALESCE(v_order.balance_applied_credits,0) = 0 THEN
    UPDATE public.partner_credit_orders
       SET status = 'expired', failed_reason = COALESCE(_reason, failed_reason)
     WHERE id = _order_id;
    RETURN 0;
  END IF;

  IF v_remainder > 0 THEN
    IF v_order.is_manual THEN
      PERFORM public.refund_partner_quota(v_order.partner_id, v_remainder, _order_id, COALESCE(_reason,'manual_refund'));
    ELSE
      INSERT INTO public.partner_customer_balances (partner_id, customer_email, client_fingerprint, credits)
      VALUES (v_order.partner_id, lower(v_order.customer_email), v_order.client_fingerprint, v_remainder)
      ON CONFLICT (partner_id, customer_email)
      DO UPDATE SET credits = public.partner_customer_balances.credits + EXCLUDED.credits,
                    client_fingerprint = COALESCE(public.partner_customer_balances.client_fingerprint, EXCLUDED.client_fingerprint),
                    updated_at = now();

      INSERT INTO public.partner_credit_ledger (partner_id, customer_email, order_id, delta, reason)
      VALUES (v_order.partner_id, lower(v_order.customer_email), _order_id, v_remainder, COALESCE(_reason,'refund'));
    END IF;
  END IF;

  UPDATE public.partner_credit_orders
     SET status = CASE
                    WHEN v_farmed >= v_order.credits AND v_order.credits > 0 THEN 'delivered'::public.partner_order_status
                    ELSE 'refunded'::public.partner_order_status
                  END,
         delivered_at = CASE WHEN v_farmed >= v_order.credits AND v_order.credits > 0 THEN now() ELSE delivered_at END,
         failed_reason = CASE WHEN v_farmed >= v_order.credits AND v_order.credits > 0 THEN NULL ELSE COALESCE(_reason, failed_reason) END,
         refunded_credits = v_remainder
   WHERE id = _order_id;

  IF v_order.assigned_bot_id IS NOT NULL THEN
    UPDATE public.farm_bots
       SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now()
     WHERE id = v_order.assigned_bot_id AND current_order_id = _order_id;
  END IF;

  RETURN v_remainder;
END $function$;


-- 3) retry_manual_order: preserva histórico em workspaces_history antes de rebuild (apenas multi)
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
  v_history jsonb;
  v_item jsonb;
  v_to_retry int := 0;
  v_done_count int := 0;
  v_first_pending text := NULL;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF NOT v_order.is_manual THEN RAISE EXCEPTION 'Pedido não é manual'; END IF;
  IF v_order.status NOT IN ('refunded'::public.partner_order_status, 'failed'::public.partner_order_status) THEN
    RAISE EXCEPTION 'Status atual (%) não permite retry', v_order.status;
  END IF;
  IF v_order.delivered_at IS NOT NULL THEN RAISE EXCEPTION 'Pedido já entregue'; END IF;

  IF v_order.multi_workspace_mode THEN
    v_plan := COALESCE(v_order.workspaces_plan, '[]'::jsonb);
    IF jsonb_array_length(v_plan) = 0 THEN
      RAISE EXCEPTION 'Pedido multi-workspace sem plano para refazer';
    END IF;

    -- snapshot da tentativa anterior em workspaces_history
    v_history := COALESCE(v_order.workspaces_history, '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
           'attempted_at', to_jsonb(v_now),
           'failed_reason', v_order.failed_reason,
           'plan', v_plan
         ));

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
      IF (v_item->>'status') = 'done' THEN
        v_new_plan := v_new_plan || jsonb_build_array(v_item);
        v_done_count := v_done_count + 1;
      ELSE
        IF v_first_pending IS NULL THEN
          v_first_pending := v_item->>'name';
          v_new_plan := v_new_plan || jsonb_build_array(jsonb_build_object(
            'name', v_item->>'name',
            'status', 'running', 'farmed', 0,
            'started_at', to_jsonb(v_now), 'finished_at', NULL, 'error', NULL
          ));
        ELSE
          v_new_plan := v_new_plan || jsonb_build_array(jsonb_build_object(
            'name', v_item->>'name',
            'status', 'pending', 'farmed', 0,
            'started_at', NULL, 'finished_at', NULL, 'error', NULL
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
           assigned_bot_id = NULL, assigned_at = NULL,
           current_workspace = v_first_pending,
           target_workspace = v_first_pending,
           failed_reason = NULL, stop_requested_at = NULL,
           refunded_credits = 0,
           workspaces_plan = v_new_plan,
           workspaces_done = v_done_count,
           workspaces_history = v_history,
           bot_invite_confirmed_at = now(),
           bot_invite_confirmed_fingerprint = COALESCE(bot_invite_confirmed_fingerprint, 'manual'),
           raw_payload = v_payload,
           updated_at = now()
     WHERE id = _order_id;

    v_assigned_bot := public.assign_bot_to_order(_order_id);
    SELECT status::text INTO v_new_status FROM public.partner_credit_orders WHERE id = _order_id;

    RETURN jsonb_build_object(
      'ok', true, 'status', v_new_status, 'assignedBotId', v_assigned_bot,
      'preferredBotId', v_preferred, 'multiWorkspace', true,
      'redebited', v_to_redebit, 'workspacesToRetry', v_to_retry,
      'workspacesDone', v_done_count, 'currentWorkspace', v_first_pending
    );
  END IF;

  -- SINGLE-WS (preservado)
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
         assigned_bot_id = NULL, assigned_at = NULL,
         failed_reason = NULL, stop_requested_at = NULL,
         refunded_credits = 0,
         bot_invite_confirmed_at = now(),
         bot_invite_confirmed_fingerprint = COALESCE(bot_invite_confirmed_fingerprint, 'manual'),
         raw_payload = v_payload,
         updated_at = now()
   WHERE id = _order_id;

  v_assigned_bot := public.assign_bot_to_order(_order_id);
  SELECT status::text INTO v_new_status FROM public.partner_credit_orders WHERE id = _order_id;

  RETURN jsonb_build_object(
    'ok', true, 'status', v_new_status, 'assignedBotId', v_assigned_bot,
    'preferredBotId', v_preferred, 'redebited', v_to_redebit
  );
END $function$;


-- 4) skip_current_workspace: pula o workspace 'running' e marca 'skipped',
--    avança para o próximo 'pending', refund proporcional do 1 workspace pulado
CREATE OR REPLACE FUNCTION public.skip_current_workspace(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.partner_credit_orders%ROWTYPE;
  v_plan jsonb;
  v_bot_email text;
  v_new_plan jsonb := '[]'::jsonb;
  v_item jsonb;
  v_next_name text := NULL;
  v_skipped_name text := NULL;
  v_partial int := 0;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  -- autoriza: admin OU dono do pedido
  IF NOT (public.has_role(auth.uid(), 'admin') OR v_order.partner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF NOT v_order.multi_workspace_mode THEN
    RAISE EXCEPTION 'Apenas pedidos multi-workspace suportam pular';
  END IF;
  IF v_order.status NOT IN ('paid','queued','processing') THEN
    RAISE EXCEPTION 'Pedido não está ativo (status %).', v_order.status;
  END IF;

  IF v_order.assigned_bot_id IS NOT NULL THEN
    SELECT email_lovable INTO v_bot_email FROM public.farm_bots WHERE id = v_order.assigned_bot_id;
  END IF;

  v_plan := COALESCE(v_order.workspaces_plan, '[]'::jsonb);
  IF jsonb_array_length(v_plan) = 0 THEN RAISE EXCEPTION 'Plano vazio'; END IF;

  -- 1) acha running, grava parcial, marca skipped
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    IF (v_item->>'status') = 'running' AND v_skipped_name IS NULL THEN
      v_skipped_name := v_item->>'name';
      IF v_bot_email IS NOT NULL AND (v_item->>'started_at') IS NOT NULL THEN
        SELECT COALESCE(SUM(creditos_adicionados)::int, 0) INTO v_partial
          FROM public.execucoes_lovable
         WHERE id_do_usuario = v_order.partner_id
           AND email_lovable = v_bot_email
           AND workspace_nome = v_skipped_name
           AND iniciado_em >= (v_item->>'started_at')::timestamptz;
      END IF;
      v_new_plan := v_new_plan || jsonb_build_array(
        jsonb_set(
          jsonb_set(
            jsonb_set(v_item, '{status}', '"skipped"'),
            '{finished_at}', to_jsonb(v_now)
          ),
          '{farmed}', to_jsonb(GREATEST(COALESCE((v_item->>'farmed')::int,0), v_partial))
        )
      );
    ELSE
      v_new_plan := v_new_plan || jsonb_build_array(v_item);
    END IF;
  END LOOP;

  -- 2) promove o primeiro 'pending' para 'running'
  v_plan := v_new_plan;
  v_new_plan := '[]'::jsonb;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    IF (v_item->>'status') = 'pending' AND v_next_name IS NULL THEN
      v_next_name := v_item->>'name';
      v_new_plan := v_new_plan || jsonb_build_array(
        jsonb_set(jsonb_set(v_item, '{status}', '"running"'), '{started_at}', to_jsonb(v_now))
      );
    ELSE
      v_new_plan := v_new_plan || jsonb_build_array(v_item);
    END IF;
  END LOOP;

  UPDATE public.partner_credit_orders
     SET workspaces_plan = v_new_plan,
         workspaces_done = (SELECT COUNT(*) FROM jsonb_array_elements(v_new_plan) w
                            WHERE (w->>'status') IN ('done','failed','skipped')),
         current_workspace = COALESCE(v_next_name, current_workspace),
         target_workspace = COALESCE(v_next_name, target_workspace),
         last_workspace = COALESCE(v_skipped_name, last_workspace),
         updated_at = now()
   WHERE id = _order_id;

  -- se não há próximo, finaliza via refund_order_remainder
  IF v_next_name IS NULL THEN
    PERFORM public.refund_order_remainder(_order_id, 'skipped_last_workspace');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'skipped', v_skipped_name,
    'partial', v_partial,
    'nextWorkspace', v_next_name,
    'finalized', v_next_name IS NULL
  );
END $function$;


-- 5) force_complete_order: marca pedido como delivered com o que já foi farmado
CREATE OR REPLACE FUNCTION public.force_complete_order(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.partner_credit_orders%ROWTYPE;
  v_remainder int;
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR v_order.partner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF v_order.status NOT IN ('paid','queued','processing','refunded','failed') THEN
    RAISE EXCEPTION 'Pedido não pode ser forçado neste estado (%).', v_order.status;
  END IF;

  -- sinaliza stop e refund (gera snapshot + refund), depois sobrescreve status para delivered
  UPDATE public.partner_credit_orders SET stop_requested_at = COALESCE(stop_requested_at, now()) WHERE id = _order_id;
  v_remainder := public.refund_order_remainder(_order_id, 'force_completed');

  UPDATE public.partner_credit_orders
     SET status = 'delivered'::public.partner_order_status,
         delivered_at = COALESCE(delivered_at, now()),
         failed_reason = NULL,
         updated_at = now()
   WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'refunded', v_remainder);
END $function$;


-- 6) retry_failed_workspaces_only: refaz apenas os 'failed' e 'skipped', mantém 'done'
CREATE OR REPLACE FUNCTION public.retry_failed_workspaces_only(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.partner_credit_orders;
  v_plan jsonb;
  v_new_plan jsonb := '[]'::jsonb;
  v_history jsonb;
  v_item jsonb;
  v_to_retry int := 0;
  v_done_count int := 0;
  v_first_pending text := NULL;
  v_now timestamptz := now();
  v_partner_quota record;
  v_to_redebit int;
  v_preferred uuid;
  v_payload jsonb;
  v_retries jsonb;
  v_per_ws constant int := 200;
  v_assigned_bot uuid;
  v_new_status text;
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF NOT v_order.is_manual THEN RAISE EXCEPTION 'Pedido não é manual'; END IF;
  IF NOT v_order.multi_workspace_mode THEN RAISE EXCEPTION 'Apenas multi-workspace'; END IF;
  IF v_order.status NOT IN ('refunded'::public.partner_order_status, 'failed'::public.partner_order_status) THEN
    RAISE EXCEPTION 'Status atual (%) não permite', v_order.status;
  END IF;

  v_plan := COALESCE(v_order.workspaces_plan, '[]'::jsonb);
  IF jsonb_array_length(v_plan) = 0 THEN RAISE EXCEPTION 'Sem plano'; END IF;

  v_history := COALESCE(v_order.workspaces_history, '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
         'attempted_at', to_jsonb(v_now),
         'failed_reason', v_order.failed_reason,
         'mode', 'failed_only',
         'plan', v_plan
       ));

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    IF (v_item->>'status') IN ('failed','skipped') THEN
      IF v_first_pending IS NULL THEN
        v_first_pending := v_item->>'name';
        v_new_plan := v_new_plan || jsonb_build_array(jsonb_build_object(
          'name', v_item->>'name', 'status', 'running', 'farmed', 0,
          'started_at', to_jsonb(v_now), 'finished_at', NULL, 'error', NULL
        ));
      ELSE
        v_new_plan := v_new_plan || jsonb_build_array(jsonb_build_object(
          'name', v_item->>'name', 'status', 'pending', 'farmed', 0,
          'started_at', NULL, 'finished_at', NULL, 'error', NULL
        ));
      END IF;
      v_to_retry := v_to_retry + 1;
    ELSE
      v_new_plan := v_new_plan || jsonb_build_array(v_item);
      IF (v_item->>'status') = 'done' THEN v_done_count := v_done_count + 1; END IF;
    END IF;
  END LOOP;

  IF v_to_retry = 0 THEN RAISE EXCEPTION 'Nada para refazer'; END IF;
  v_to_redebit := v_to_retry * v_per_ws;

  SELECT limite_creditos, creditos_consumidos INTO v_partner_quota
  FROM public.parceiros WHERE user_id = v_order.partner_id FOR UPDATE;
  IF v_partner_quota.creditos_consumidos + v_to_redebit > v_partner_quota.limite_creditos THEN
    RAISE EXCEPTION 'Limite de créditos do parceiro insuficiente (restam %)',
      GREATEST(0, v_partner_quota.limite_creditos - v_partner_quota.creditos_consumidos);
  END IF;

  PERFORM public.debit_partner_quota(v_order.partner_id, v_to_redebit, _order_id, 'manual_retry_failed_only');

  v_preferred := v_order.assigned_bot_id;
  v_retries := COALESCE(v_order.raw_payload->'manualOrder'->'retries', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
         'at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         'mode', 'failed_only',
         'redebited', v_to_redebit,
         'workspacesToRetry', v_to_retry
       ));
  v_payload := COALESCE(v_order.raw_payload, '{}'::jsonb);
  v_payload := jsonb_set(v_payload, '{manualOrder,retries}', v_retries, true);
  IF v_preferred IS NOT NULL THEN
    v_payload := jsonb_set(v_payload, '{manualOrder,preferredBotId}', to_jsonb(v_preferred::text), true);
  END IF;

  UPDATE public.partner_credit_orders
     SET status = 'paid'::public.partner_order_status,
         assigned_bot_id = NULL, assigned_at = NULL,
         current_workspace = v_first_pending, target_workspace = v_first_pending,
         failed_reason = NULL, stop_requested_at = NULL, refunded_credits = 0,
         workspaces_plan = v_new_plan,
         workspaces_done = (SELECT COUNT(*) FROM jsonb_array_elements(v_new_plan) w
                            WHERE (w->>'status') IN ('done','failed','skipped')),
         workspaces_history = v_history,
         bot_invite_confirmed_at = now(),
         bot_invite_confirmed_fingerprint = COALESCE(bot_invite_confirmed_fingerprint, 'manual'),
         raw_payload = v_payload,
         updated_at = now()
   WHERE id = _order_id;

  v_assigned_bot := public.assign_bot_to_order(_order_id);
  SELECT status::text INTO v_new_status FROM public.partner_credit_orders WHERE id = _order_id;

  RETURN jsonb_build_object(
    'ok', true, 'status', v_new_status, 'assignedBotId', v_assigned_bot,
    'redebited', v_to_redebit, 'workspacesToRetry', v_to_retry,
    'workspacesDone', v_done_count, 'currentWorkspace', v_first_pending
  );
END $function$;
