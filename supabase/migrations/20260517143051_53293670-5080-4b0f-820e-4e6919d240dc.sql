
CREATE OR REPLACE FUNCTION public.confirm_bot_invite(_order_id uuid, _fingerprint text)
 RETURNS partner_credit_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.partner_credit_orders;
  v_new_status public.partner_order_status;
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF v_order.client_fingerprint IS NULL OR v_order.client_fingerprint <> _fingerprint THEN
    RAISE EXCEPTION 'Fingerprint inválido';
  END IF;
  IF v_order.assigned_bot_id IS NULL AND v_order.status <> 'waiting_invite'::public.partner_order_status THEN
    RAISE EXCEPTION 'Bot ainda não atribuído';
  END IF;
  IF v_order.status NOT IN ('paid'::public.partner_order_status,
                            'queued'::public.partner_order_status,
                            'processing'::public.partner_order_status,
                            'waiting_invite'::public.partner_order_status,
                            'waiting_workspace'::public.partner_order_status) THEN
    RAISE EXCEPTION 'Pedido não está em estado válido para confirmação (%).', v_order.status;
  END IF;

  IF v_order.status = 'waiting_invite'::public.partner_order_status THEN
    IF v_order.target_workspace IS NULL OR length(trim(v_order.target_workspace)) = 0 THEN
      v_new_status := 'waiting_workspace'::public.partner_order_status;
    ELSE
      v_new_status := 'paid'::public.partner_order_status;
    END IF;
  ELSE
    v_new_status := v_order.status;
  END IF;

  UPDATE public.partner_credit_orders
     SET bot_invite_confirmed_at = COALESCE(bot_invite_confirmed_at, now()),
         bot_invite_confirmed_fingerprint = COALESCE(bot_invite_confirmed_fingerprint, _fingerprint),
         status = v_new_status,
         updated_at = now()
   WHERE id = _order_id
   RETURNING * INTO v_order;

  IF v_new_status = 'paid'::public.partner_order_status AND v_order.assigned_bot_id IS NULL THEN
    PERFORM public.assign_bot_to_order(_order_id);
    SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id;
  ELSIF v_new_status = 'paid'::public.partner_order_status
     AND v_order.assigned_bot_id IS NOT NULL
     AND v_order.target_workspace IS NOT NULL
     AND length(btrim(v_order.target_workspace)) > 0 THEN
    UPDATE public.farm_bots
       SET status = 'busy', current_order_id = _order_id, last_heartbeat_at = now(), updated_at = now()
     WHERE id = v_order.assigned_bot_id
       AND (status = 'idle' OR current_order_id = _order_id OR current_order_id IS NULL);
    UPDATE public.partner_credit_orders
       SET status = 'processing'::public.partner_order_status,
           assigned_at = COALESCE(assigned_at, now()),
           failed_reason = NULL,
           updated_at = now()
     WHERE id = _order_id
     RETURNING * INTO v_order;
  END IF;

  RETURN v_order;
END $function$;
