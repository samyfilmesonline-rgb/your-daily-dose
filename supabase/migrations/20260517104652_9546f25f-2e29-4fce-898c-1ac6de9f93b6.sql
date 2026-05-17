
-- 1) skip_current_workspace com motivo opcional
DROP FUNCTION IF EXISTS public.skip_current_workspace(uuid);

CREATE OR REPLACE FUNCTION public.skip_current_workspace(_order_id uuid, _reason text DEFAULT 'manual')
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
  v_at_limit boolean := (_reason = 'already_at_limit');
  v_new_status text;
  v_new_farmed int;
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
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

  -- 1) acha running, calcula parcial e marca conforme reason
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

      IF v_at_limit THEN
        v_new_status := 'done';
        v_new_farmed := GREATEST(COALESCE((v_item->>'farmed')::int,0), v_partial, 200);
      ELSE
        v_new_status := 'skipped';
        v_new_farmed := GREATEST(COALESCE((v_item->>'farmed')::int,0), v_partial);
      END IF;

      v_new_plan := v_new_plan || jsonb_build_array(
        jsonb_set(
          jsonb_set(
            jsonb_set(v_item, '{status}', to_jsonb(v_new_status)),
            '{finished_at}', to_jsonb(v_now)
          ),
          '{farmed}', to_jsonb(v_new_farmed)
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
    PERFORM public.refund_order_remainder(_order_id,
      CASE WHEN v_at_limit THEN 'completed_at_limit' ELSE 'skipped_last_workspace' END);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'skipped', v_skipped_name,
    'markedAs', v_new_status,
    'partial', CASE WHEN v_at_limit THEN 200 ELSE v_partial END,
    'nextWorkspace', v_next_name,
    'finalized', v_next_name IS NULL
  );
END $function$;

-- 2) refund_order_remainder: tratar parciais como refunded em vez de failed
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

  IF v_order.multi_workspace_mode THEN
    v_plan := COALESCE(v_order.workspaces_plan, '[]'::jsonb);
    v_total := COALESCE(v_order.workspaces_total, jsonb_array_length(v_plan));
    v_price := COALESCE(v_order.price_cents_per_workspace, 0);

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

    -- NEW: parciais sem nenhum 'done' → refunded (partial_only), não failed
    IF v_stop THEN
      v_final_status := 'refunded'::public.partner_order_status;
    ELSIF v_done_count >= COALESCE(v_total, v_done_count) AND v_done_count > 0 THEN
      v_final_status := 'delivered'::public.partner_order_status;
    ELSIF v_done_count = 0 AND v_farmed = 0 THEN
      v_final_status := 'failed'::public.partner_order_status;
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
           failed_reason = CASE
             WHEN v_final_status = 'delivered' THEN NULL
             WHEN v_final_status = 'refunded' AND v_done_count = 0 AND v_farmed > 0 THEN 'partial_only'
             ELSE COALESCE(_reason, failed_reason)
           END,
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
