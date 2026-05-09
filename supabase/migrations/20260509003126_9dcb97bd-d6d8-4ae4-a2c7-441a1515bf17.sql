DO $$
DECLARE v_remainder int; v_partner uuid;
BEGIN
  SELECT partner_id INTO v_partner FROM public.partner_credit_orders WHERE id = '71e20016-0e8d-41e3-9686-543779f0b378';
  v_remainder := public.refund_order_remainder('71e20016-0e8d-41e3-9686-543779f0b378'::uuid, 'worker_stalled');
  PERFORM public.assign_next_queued_order(v_partner);
  RAISE NOTICE 'Refunded: %', v_remainder;
END $$;