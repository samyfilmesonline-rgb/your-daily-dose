
-- 1. Customer balances table
CREATE TABLE IF NOT EXISTS public.partner_customer_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  customer_email text NOT NULL,
  client_fingerprint text,
  credits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_customer_balances_unique UNIQUE (partner_id, customer_email),
  CONSTRAINT partner_customer_balances_credits_nonneg CHECK (credits >= 0)
);

ALTER TABLE public.partner_customer_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY pcb_admin_all ON public.partner_customer_balances
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY pcb_partner_select ON public.partner_customer_balances
  FOR SELECT TO authenticated
  USING (partner_id = auth.uid());

CREATE TRIGGER trg_pcb_updated_at
  BEFORE UPDATE ON public.partner_customer_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_pcp_updated_at();

-- 2. Ledger
CREATE TABLE IF NOT EXISTS public.partner_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  customer_email text NOT NULL,
  order_id uuid,
  delta integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY pcl_admin_all ON public.partner_credit_ledger
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY pcl_partner_select ON public.partner_credit_ledger
  FOR SELECT TO authenticated
  USING (partner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_pcl_partner_email ON public.partner_credit_ledger(partner_id, customer_email);

-- 3. New columns on orders
ALTER TABLE public.partner_credit_orders
  ADD COLUMN IF NOT EXISTS stop_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS balance_applied_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_applied_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_credits integer NOT NULL DEFAULT 0;

-- 4. refund_order_remainder
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

  -- Idempotência: já em estado terminal de reembolso/expirado/entregue, não re-credita
  IF v_order.status IN ('refunded','expired') THEN
    RETURN v_order.refunded_credits;
  END IF;

  -- Calcula farmed via execucoes_lovable (mesma lógica das edge functions)
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

  -- Se nenhum crédito foi pago de fato (não passou de paid), não credita saldo
  IF v_order.paid_at IS NULL AND v_order.balance_applied_credits = 0 THEN
    UPDATE public.partner_credit_orders
       SET status = 'expired', failed_reason = COALESCE(_reason, failed_reason)
     WHERE id = _order_id;
    RETURN 0;
  END IF;

  IF v_remainder > 0 THEN
    INSERT INTO public.partner_customer_balances (partner_id, customer_email, client_fingerprint, credits)
    VALUES (v_order.partner_id, lower(v_order.customer_email), v_order.client_fingerprint, v_remainder)
    ON CONFLICT (partner_id, customer_email)
    DO UPDATE SET credits = public.partner_customer_balances.credits + EXCLUDED.credits,
                  client_fingerprint = COALESCE(public.partner_customer_balances.client_fingerprint, EXCLUDED.client_fingerprint),
                  updated_at = now();

    INSERT INTO public.partner_credit_ledger (partner_id, customer_email, order_id, delta, reason)
    VALUES (v_order.partner_id, lower(v_order.customer_email), _order_id, v_remainder, COALESCE(_reason,'refund'));
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

  -- Libera o bot se ainda atribuído a este pedido
  IF v_order.assigned_bot_id IS NOT NULL THEN
    UPDATE public.farm_bots
       SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now()
     WHERE id = v_order.assigned_bot_id AND current_order_id = _order_id;
  END IF;

  RETURN v_remainder;
END $$;

-- 5. stop_order_partial
CREATE OR REPLACE FUNCTION public.stop_order_partial(_order_id uuid, _fingerprint text)
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
  IF v_order.client_fingerprint IS NULL OR v_order.client_fingerprint <> _fingerprint THEN
    RAISE EXCEPTION 'Fingerprint inválido';
  END IF;
  IF v_order.status NOT IN ('paid','queued','processing') THEN
    RAISE EXCEPTION 'Pedido não pode ser parado neste estado (%).', v_order.status;
  END IF;

  UPDATE public.partner_credit_orders SET stop_requested_at = now() WHERE id = _order_id;
  v_remainder := public.refund_order_remainder(_order_id, 'stopped_by_customer');
  RETURN v_remainder;
END $$;

-- 6. apply_balance_to_order (atomic decrement)
CREATE OR REPLACE FUNCTION public.apply_balance_to_order(_partner_id uuid, _customer_email text, _amount integer, _order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_new integer;
BEGIN
  IF _amount <= 0 THEN RETURN 0; END IF;
  UPDATE public.partner_customer_balances
     SET credits = credits - _amount, updated_at = now()
   WHERE partner_id = _partner_id
     AND customer_email = lower(_customer_email)
     AND credits >= _amount
   RETURNING credits INTO v_new;

  IF v_new IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.partner_credit_ledger (partner_id, customer_email, order_id, delta, reason)
  VALUES (_partner_id, lower(_customer_email), _order_id, -_amount, 'applied_to_order');

  RETURN _amount;
END $$;

-- 7. Atualiza release_bot para reembolsar em caso de falha
CREATE OR REPLACE FUNCTION public.release_bot(_bot_id uuid, _order_id uuid, _success boolean, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_partner uuid;
BEGIN
  SELECT partner_id INTO v_partner FROM public.farm_bots WHERE id = _bot_id;

  UPDATE public.farm_bots
     SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now()
   WHERE id = _bot_id;

  IF _success THEN
    UPDATE public.partner_credit_orders
       SET status = 'delivered'::public.partner_order_status,
           delivered_at = now(),
           failed_reason = NULL
     WHERE id = _order_id;
  ELSE
    -- Em caso de falha: reembolsa o restante como saldo do cliente
    PERFORM public.refund_order_remainder(_order_id, COALESCE(_reason, 'worker_failure'));
  END IF;

  IF v_partner IS NOT NULL THEN
    PERFORM public.assign_next_queued_order(v_partner);
  END IF;
END $function$;
