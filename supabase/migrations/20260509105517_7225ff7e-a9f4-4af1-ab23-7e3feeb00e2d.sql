REVOKE ALL ON FUNCTION public.find_sticky_bot_for_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_bot_to_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_next_queued_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_manual_order(uuid) FROM PUBLIC, anon, authenticated;