-- Manual orders: debit/refund from partner quota

ALTER TABLE public.partner_credit_orders
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

UPDATE public.partner_credit_orders
   SET is_manual = true
 WHERE tx_id LIKE 'manual:%' AND is_manual = false;

-- Debit partner quota (atomic with limit check)
CREATE OR REPLACE FUNCTION public.debit_partner_quota(_partner_id uuid, _amount integer, _order_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_new numeric; v_lim numeric;
BEGIN
  IF _amount <= 0 THEN RETURN; END IF;
  SELECT limite_creditos INTO v_lim FROM public.parceiros WHERE user_id = _partner_id FOR UPDATE;
  IF v_lim IS NULL THEN RAISE EXCEPTION 'Parceiro não encontrado'; END IF;

  UPDATE public.parceiros
     SET creditos_consumidos = creditos_consumidos + _amount,
         atualizado_em = now()
   WHERE user_id = _partner_id
     AND creditos_consumidos + _amount <= limite_creditos
   RETURNING creditos_consumidos INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Limite de créditos do parceiro insuficiente';
  END IF;

  INSERT INTO public.partner_credit_ledger (partner_id, customer_email, order_id, delta, reason)
  SELECT _partner_id, lower(o.customer_email), _order_id, -_amount, _reason
    FROM public.partner_credit_orders o WHERE o.id = _order_id;
END $$;

-- Refund partner quota
CREATE OR REPLACE FUNCTION public.refund_partner_quota(_partner_id uuid, _amount integer, _order_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _amount <= 0 THEN RETURN; END IF;
  UPDATE public.parceiros
     SET creditos_consumidos = GREATEST(creditos_consumidos - _amount, 0),
         atualizado_em = now()
   WHERE user_id = _partner_id;

  INSERT INTO public.partner_credit_ledger (partner_id, customer_email, order_id, delta, reason)
  SELECT _partner_id, lower(o.customer_email), _order_id, _amount, _reason
    FROM public.partner_credit_orders o WHERE o.id = _order_id;
END $$;

-- Update refund_order_remainder to route refunds for manual orders to partner quota
CREATE OR REPLACE FUNCTION public.refund_order_remainder(_order_id uuid, _reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.partner_credit_orders;
  v_bot_email text;
  v_farmed integer := 0;
  v_remainder integer := 0;
  v_since timestamptz;
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RETURN 0; END IF;

  IF v_order.status IN ('refunded','expired') THEN
    RETURN v_order.refunded_credits;
  END IF;

  IF v_order.assigned_bot_id IS NOT NULL THEN
    SELECT email_lovable INTO v_bot_email FROM public.farm_bots WHERE id = v_order.assigned_bot_id;
  END IF;

  v_since := COALESCE(v_order.assigned_at, v_order.paid_at);

  IF v_bot_email IS NOT NULL AND v_order.target_workspace IS NOT NULL THEN
    SELECT COALESCE(SUM(creditos_adicionados), 0)::int INTO v_farmed
    FROM public.execucoes_lovable
    WHERE id_do_usuario = v_order.partner_id
      AND email_lovable = v_bot_email
      AND workspace_nome = v_order.target_workspace
      AND (v_since IS NULL OR iniciado_em >= v_since);
  END IF;

  v_remainder := GREATEST(v_order.credits - v_farmed, 0);

  -- Não pago de fato: expira (manual orders são marcados paid imediatamente, então não cai aqui)
  IF v_order.paid_at IS NULL AND v_order.balance_applied_credits = 0 THEN
    UPDATE public.partner_credit_orders
       SET status = 'expired', failed_reason = COALESCE(_reason, failed_reason)
     WHERE id = _order_id;
    RETURN 0;
  END IF;

  IF v_remainder > 0 THEN
    IF v_order.is_manual THEN
      -- Estorno volta para a cota do parceiro
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
                    WHEN v_farmed >= v_order.credits THEN 'delivered'::public.partner_order_status
                    ELSE 'refunded'::public.partner_order_status
                  END,
         delivered_at = CASE WHEN v_farmed >= v_order.credits THEN now() ELSE delivered_at END,
         failed_reason = CASE WHEN v_farmed >= v_order.credits THEN NULL ELSE COALESCE(_reason, failed_reason) END,
         refunded_credits = v_remainder
   WHERE id = _order_id;

  IF v_order.assigned_bot_id IS NOT NULL THEN
    UPDATE public.farm_bots
       SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now()
     WHERE id = v_order.assigned_bot_id AND current_order_id = _order_id;
  END IF;

  RETURN v_remainder;
END $$;

-- Cancel manual order (admin or partner owner)
CREATE OR REPLACE FUNCTION public.cancel_manual_order(_order_id uuid, _reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.partner_credit_orders;
  v_remainder integer;
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF NOT v_order.is_manual THEN RAISE EXCEPTION 'Pedido não é manual'; END IF;
  IF v_order.status NOT IN ('paid','queued','processing') THEN
    RAISE EXCEPTION 'Pedido não pode ser cancelado neste estado (%).', v_order.status;
  END IF;

  UPDATE public.partner_credit_orders SET stop_requested_at = now() WHERE id = _order_id;
  v_remainder := public.refund_order_remainder(_order_id, COALESCE(_reason,'canceled_manual'));

  -- Tenta puxar próximo da fila do parceiro
  PERFORM public.assign_next_queued_order(v_order.partner_id);

  RETURN v_remainder;
END $$;

REVOKE EXECUTE ON FUNCTION public.debit_partner_quota(uuid, integer, uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refund_partner_quota(uuid, integer, uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cancel_manual_order(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.cancel_manual_order(uuid, text) TO authenticated;