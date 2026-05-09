
-- 1) Stop broadcasting execucoes_lovable to all realtime subscribers
ALTER PUBLICATION supabase_realtime DROP TABLE public.execucoes_lovable;

-- 2) Lock down SECURITY DEFINER functions that should not be directly callable
--    by anon/authenticated clients (only service_role / edge functions invoke them).
REVOKE ALL ON FUNCTION public.cancel_manual_order(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_manual_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.farm_bots_guard_partner_updates() FROM PUBLIC, anon, authenticated;
