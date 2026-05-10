
-- 1) Guard release_bot: não marcar multi-ws como delivered pelo fluxo antigo
CREATE OR REPLACE FUNCTION public.release_bot(_bot_id uuid, _order_id uuid, _success boolean, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partner uuid;
  v_multi boolean;
BEGIN
  SELECT partner_id INTO v_partner FROM public.farm_bots WHERE id = _bot_id;

  SELECT multi_workspace_mode INTO v_multi
    FROM public.partner_credit_orders WHERE id = _order_id;

  UPDATE public.farm_bots
     SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now()
   WHERE id = _bot_id;

  IF COALESCE(v_multi, false) THEN
    -- multi-workspace: o fluxo legado nunca finaliza o pedido.
    -- A finalização real acontece em partner-shop-multi-workspace-tick.
    RAISE LOG 'release_bot: skipping finalization for multi_workspace order %', _order_id;
  ELSIF _success THEN
    UPDATE public.partner_credit_orders
       SET status = 'delivered'::public.partner_order_status,
           delivered_at = now(),
           failed_reason = NULL
     WHERE id = _order_id;
  ELSE
    PERFORM public.refund_order_remainder(_order_id, COALESCE(_reason, 'worker_failure'));
  END IF;

  IF v_partner IS NOT NULL THEN
    PERFORM public.assign_next_queued_order(v_partner);
  END IF;
END $function$;

-- 2) Guard refund_order_remainder: pular multi-ws sem worker iniciado
CREATE OR REPLACE FUNCTION public.refund_order_remainder(_order_id uuid, _reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.partner_credit_orders%ROWTYPE;
  v_farmed integer := 0;
  v_remainder integer := 0;
  v_since timestamptz;
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Multi-workspace: nada a fazer aqui. tick cuida do refund/finalização.
  IF v_order.multi_workspace_mode THEN
    RAISE LOG 'refund_order_remainder: skipping multi_workspace order %', _order_id;
    RETURN 0;
  END IF;

  IF v_order.delivered_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  v_since := COALESCE(v_order.assigned_at, v_order.paid_at);

  IF v_order.assigned_bot_id IS NOT NULL AND v_order.target_workspace IS NOT NULL THEN
    SELECT COALESCE(SUM(creditos_adicionados), 0)::int
      INTO v_farmed
      FROM public.execucoes_lovable e
      JOIN public.farm_bots b ON b.id = v_order.assigned_bot_id
     WHERE e.id_do_usuario = v_order.partner_id
       AND e.email_lovable = b.email_lovable
       AND e.workspace_nome = v_order.target_workspace
       AND (v_since IS NULL OR e.iniciado_em >= v_since);
  END IF;

  v_remainder := GREATEST(v_order.credits - v_farmed, 0);

  IF v_order.paid_at IS NULL AND v_order.balance_applied_credits = 0 THEN
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

-- 3) Limpa pedido travado e libera bot
DELETE FROM public.partner_credit_orders WHERE id = '2dd628c1-112a-4a4b-84b3-3a5b39234b52';
UPDATE public.farm_bots
   SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now()
 WHERE current_order_id = '2dd628c1-112a-4a4b-84b3-3a5b39234b52'
    OR id = 'c9466ab1-b9ff-436e-880a-bdf242fe77cd';
