
-- Limpa workspace inválido em pedidos antigos
UPDATE public.partner_credit_orders
   SET target_workspace = NULL
 WHERE lower(trim(target_workspace)) IN (
   'em andamento','processando','aguardando','aguardando pagamento',
   'aguardando worker','aguardando workspace','aguardando convite',
   'pending','processing','queued','paid','waiting',
   'waiting_invite','waiting_workspace','delivered','failed','refunded','expired'
 );

UPDATE public.partner_credit_orders
   SET current_workspace = NULL
 WHERE lower(trim(current_workspace)) IN (
   'em andamento','processando','aguardando','aguardando pagamento',
   'aguardando worker','aguardando workspace','aguardando convite',
   'pending','processing','queued','paid','waiting',
   'waiting_invite','waiting_workspace','delivered','failed','refunded','expired'
 );

-- Libera o bot do pedido travado e move para waiting_workspace
DO $$
DECLARE
  v_bot uuid;
BEGIN
  SELECT assigned_bot_id INTO v_bot
    FROM public.partner_credit_orders
   WHERE id = 'cb71f332-72fc-48fc-bc07-9f699c74f104';

  UPDATE public.partner_credit_orders
     SET status = 'waiting_workspace'::public.partner_order_status,
         assigned_bot_id = NULL,
         assigned_at = NULL,
         failed_reason = NULL,
         updated_at = now()
   WHERE id = 'cb71f332-72fc-48fc-bc07-9f699c74f104';

  IF v_bot IS NOT NULL THEN
    UPDATE public.farm_bots
       SET status = 'idle',
           current_order_id = NULL,
           last_heartbeat_at = now()
     WHERE id = v_bot
       AND current_order_id = 'cb71f332-72fc-48fc-bc07-9f699c74f104';
  END IF;
END $$;
