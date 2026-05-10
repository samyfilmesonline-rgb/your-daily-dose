-- One-off cleanup: destrava o pedido multi-ws preso e pausa a programação responsável
DO $$
DECLARE v_refund integer;
BEGIN
  SELECT public.refund_order_remainder(
    '00e21be9-2fd4-432a-9c41-d09e56ed683c'::uuid,
    'stopped_by_customer_manual_cleanup'
  ) INTO v_refund;
  RAISE NOTICE 'refunded credits: %', v_refund;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cleanup skipped: %', SQLERRM;
END $$;

UPDATE public.partner_order_schedules
   SET status = 'paused', updated_at = now()
 WHERE id = '3cf4042a-7a44-4846-a6ad-2950d1e7d0d5'
   AND status = 'active';