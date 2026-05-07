
ALTER TABLE public.partner_credit_orders
  ADD COLUMN IF NOT EXISTS bot_invite_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS bot_invite_confirmed_fingerprint text;

CREATE OR REPLACE FUNCTION public.confirm_bot_invite(_order_id uuid, _fingerprint text)
RETURNS public.partner_credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.partner_credit_orders;
BEGIN
  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF v_order.client_fingerprint IS NULL OR v_order.client_fingerprint <> _fingerprint THEN
    RAISE EXCEPTION 'Fingerprint inválido';
  END IF;
  IF v_order.assigned_bot_id IS NULL THEN
    RAISE EXCEPTION 'Bot ainda não atribuído';
  END IF;
  IF v_order.status NOT IN ('paid','queued','processing') THEN
    RAISE EXCEPTION 'Pedido não está em estado válido para confirmação (%).', v_order.status;
  END IF;
  IF v_order.bot_invite_confirmed_at IS NULL THEN
    UPDATE public.partner_credit_orders
       SET bot_invite_confirmed_at = now(),
           bot_invite_confirmed_fingerprint = _fingerprint
     WHERE id = _order_id
     RETURNING * INTO v_order;
  END IF;
  RETURN v_order;
END $$;

ALTER TABLE public.partner_credit_orders REPLICA IDENTITY FULL;
ALTER TABLE public.farm_bots REPLICA IDENTITY FULL;
ALTER TABLE public.execucoes_lovable REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_credit_orders;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.farm_bots;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.execucoes_lovable;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
