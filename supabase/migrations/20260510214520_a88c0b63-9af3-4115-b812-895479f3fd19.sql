REVOKE EXECUTE ON FUNCTION public.refund_order_remainder(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_order_remainder(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_order_remainder(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_order_remainder(uuid, text) TO service_role;