-- 1) assign_bot_to_order: ignora pedidos em estados de espera
CREATE OR REPLACE FUNCTION public.assign_bot_to_order(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_partner uuid;
  v_status public.partner_order_status;
  v_bot uuid;
  v_claimed uuid;
BEGIN
  SELECT partner_id, status INTO v_partner, v_status
    FROM public.partner_credit_orders
   WHERE id = _order_id FOR UPDATE;
  IF v_partner IS NULL THEN RETURN NULL; END IF;

  -- Estados de espera não devem ocupar bot
  IF v_status IN ('waiting_invite'::public.partner_order_status,
                  'waiting_workspace'::public.partner_order_status) THEN
    RETURN NULL;
  END IF;

  v_bot := public.find_sticky_bot_for_order(_order_id);

  IF v_bot IS NULL THEN
    UPDATE public.partner_credit_orders SET status = 'queued' WHERE id = _order_id;
    RETURN NULL;
  END IF;

  UPDATE public.farm_bots
     SET status = 'busy', current_order_id = _order_id
   WHERE id = v_bot AND status = 'idle'
  RETURNING id INTO v_claimed;

  IF v_claimed IS NULL THEN
    UPDATE public.partner_credit_orders SET status = 'queued' WHERE id = _order_id;
    RETURN NULL;
  END IF;

  UPDATE public.partner_credit_orders
     SET status = 'processing',
         assigned_bot_id = v_claimed,
         assigned_at = now()
   WHERE id = _order_id;

  RETURN v_claimed;
END $$;

-- 2) confirm_bot_invite: aceita waiting_invite e transita para waiting_workspace/paid
CREATE OR REPLACE FUNCTION public.confirm_bot_invite(_order_id uuid, _fingerprint text)
RETURNS public.partner_credit_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  -- Define novo status quando estava em waiting_invite
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

  -- Se transitou para paid e ainda não há bot, tentar atribuir
  IF v_new_status = 'paid'::public.partner_order_status AND v_order.assigned_bot_id IS NULL THEN
    PERFORM public.assign_bot_to_order(_order_id);
    SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id;
  END IF;

  RETURN v_order;
END $$;

-- 3) set_order_target_workspace: define workspace real com validação
CREATE OR REPLACE FUNCTION public.set_order_target_workspace(
  _order_id uuid, _fingerprint text, _workspace text
)
RETURNS public.partner_credit_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order public.partner_credit_orders;
  v_clean text;
  v_lower text;
  v_new_status public.partner_order_status;
BEGIN
  v_clean := btrim(coalesce(_workspace, ''));
  IF length(v_clean) < 2 THEN
    RAISE EXCEPTION 'Workspace inválido';
  END IF;
  v_lower := lower(v_clean);
  IF v_lower IN ('em andamento','processando','aguardando','pending','processing',
                 'waiting','waiting_invite','waiting_workspace','queued','paid',
                 'delivered','failed','refunded','expired') THEN
    RAISE EXCEPTION 'Workspace inválido: não use rótulo de status (%).', v_clean;
  END IF;

  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF v_order.client_fingerprint IS NULL OR v_order.client_fingerprint <> _fingerprint THEN
    RAISE EXCEPTION 'Fingerprint inválido';
  END IF;
  IF v_order.status NOT IN ('waiting_invite'::public.partner_order_status,
                            'waiting_workspace'::public.partner_order_status,
                            'paid'::public.partner_order_status,
                            'queued'::public.partner_order_status,
                            'processing'::public.partner_order_status) THEN
    RAISE EXCEPTION 'Pedido não permite definir workspace neste estado (%).', v_order.status;
  END IF;

  -- Calcula próximo status
  IF v_order.bot_invite_confirmed_at IS NOT NULL
     AND v_order.status IN ('waiting_invite'::public.partner_order_status,
                            'waiting_workspace'::public.partner_order_status) THEN
    v_new_status := 'paid'::public.partner_order_status;
  ELSE
    v_new_status := v_order.status;
  END IF;

  UPDATE public.partner_credit_orders
     SET target_workspace = v_clean,
         current_workspace = CASE
           WHEN current_workspace IS NULL OR length(btrim(current_workspace)) = 0
             THEN v_clean
           ELSE current_workspace
         END,
         failed_reason = CASE
           WHEN failed_reason IN ('waiting_workspace','waiting_invite') THEN NULL
           ELSE failed_reason
         END,
         status = v_new_status,
         updated_at = now()
   WHERE id = _order_id
   RETURNING * INTO v_order;

  IF v_new_status = 'paid'::public.partner_order_status AND v_order.assigned_bot_id IS NULL THEN
    PERFORM public.assign_bot_to_order(_order_id);
    SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id;
  END IF;

  RETURN v_order;
END $$;

REVOKE ALL ON FUNCTION public.set_order_target_workspace(uuid,text,text) FROM PUBLIC, anon, authenticated;