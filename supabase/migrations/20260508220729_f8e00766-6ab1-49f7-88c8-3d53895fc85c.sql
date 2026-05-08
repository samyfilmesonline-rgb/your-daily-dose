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

  v_retries := COALESCE(v_order.raw_payload->'manualOrder'->'retries', '[]'::jsonb);
  v_retry_entry := jsonb_build_object(
    'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'previous_failed_reason', v_order.failed_reason,
    'previous_assigned_bot_id', v_order.assigned_bot_id,
    'redebited', v_to_redebit
  );
  v_retries := v_retries || jsonb_build_array(v_retry_entry);

  UPDATE public.partner_credit_orders
     SET status = 'paid'::public.partner_order_status,
         assigned_bot_id = NULL,
         assigned_at = NULL,
         failed_reason = NULL,
         stop_requested_at = NULL,
         refunded_credits = 0,
         bot_invite_confirmed_at = now(),
         bot_invite_confirmed_fingerprint = COALESCE(bot_invite_confirmed_fingerprint, 'manual'),
         raw_payload = jsonb_set(COALESCE(raw_payload, '{}'::jsonb), '{manualOrder,retries}', v_retries, true),
         updated_at = now()
   WHERE id = _order_id;

  v_assigned_bot := public.assign_bot_to_order(_order_id);
  SELECT status::text INTO v_new_status FROM public.partner_credit_orders WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'status', v_new_status, 'assignedBotId', v_assigned_bot, 'redebited', v_to_redebit);
END $function$;

UPDATE public.partner_credit_orders
   SET bot_invite_confirmed_at = now(),
       bot_invite_confirmed_fingerprint = 'manual'
 WHERE is_manual = true
   AND bot_invite_confirmed_at IS NULL
   AND status IN ('paid'::public.partner_order_status, 'queued'::public.partner_order_status, 'processing'::public.partner_order_status);