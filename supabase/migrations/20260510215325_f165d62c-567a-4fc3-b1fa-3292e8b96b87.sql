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
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Idempotência: se já está em estado terminal, garante apenas que o bot esteja livre
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

  -- =========== MULTI-WORKSPACE ===========
  IF v_order.multi_workspace_mode THEN
    v_plan := COALESCE(v_order.workspaces_plan, '[]'::jsonb);
    v_total := COALESCE(v_order.workspaces_total, jsonb_array_length(v_plan));
    v_price := COALESCE(v_order.price_cents_per_workspace, 0);

    -- Soma farmed só dos workspaces marcados done no plano
    SELECT COALESCE(SUM((w->>'farmed')::int), 0)
      INTO v_farmed
      FROM jsonb_array_elements(v_plan) w
     WHERE (w->>'status') = 'done';

    -- Marca pendentes/running como skipped no plano (independente de stop, é finalização)
    SELECT COALESCE(jsonb_agg(
             CASE
               WHEN (w->>'status') IN ('pending','running')
                 THEN jsonb_set(jsonb_set(w, '{status}', '"skipped"'), '{finished_at}', to_jsonb(now()))
               ELSE w
             END
           ), '[]'::jsonb)
      INTO v_plan
      FROM jsonb_array_elements(COALESCE(v_order.workspaces_plan, '[]'::jsonb)) w;

    SELECT
      COUNT(*) FILTER (WHERE (w->>'status') = 'done'),
      COUNT(*) FILTER (WHERE (w->>'status') = 'failed'),
      COUNT(*) FILTER (WHERE (w->>'status') = 'skipped')
      INTO v_done_count, v_failed_count, v_skipped_count
      FROM jsonb_array_elements(v_plan) w;

    v_remainder := GREATEST(COALESCE(v_order.credits, 0) - v_farmed, 0);

    -- Se nada foi pago e nada de saldo aplicado e não é manual, marca expired sem creditar
    IF v_order.paid_at IS NULL AND COALESCE(v_order.balance_applied_credits,0) = 0 AND NOT v_order.is_manual THEN
      UPDATE public.partner_credit_orders
         SET status = 'expired',
             failed_reason = COALESCE(_reason, failed_reason),
             workspaces_plan = v_plan,
             workspaces_done = v_done_count + v_failed_count + v_skipped_count,
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

    -- Refund: manual → cota do parceiro; pago → saldo do cliente
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

    -- Decisão de status final (NUNCA usar 'canceled')
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

    -- Pausa programação se o pedido veio de uma e não terminou em delivered
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

  -- =========== SINGLE-WORKSPACE (fluxo legado, inalterado) ===========
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

REVOKE EXECUTE ON FUNCTION public.refund_order_remainder(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_order_remainder(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_order_remainder(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_order_remainder(uuid, text) TO service_role;