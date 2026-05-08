
-- 1. app_test_payment_profiles: restrict reads to admins only
DROP POLICY IF EXISTS "app_test_payment_profiles_select_active" ON public.app_test_payment_profiles;
CREATE POLICY "app_test_payment_profiles_admin_select"
  ON public.app_test_payment_profiles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. Realtime: drop sensitive tables from publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.farm_bots;
ALTER PUBLICATION supabase_realtime DROP TABLE public.partner_credit_orders;

-- 3. Recreate farm_bots_partner_view with security_invoker
DROP VIEW IF EXISTS public.farm_bots_partner_view;
CREATE VIEW public.farm_bots_partner_view
  WITH (security_invoker = true) AS
SELECT id, partner_id, email_lovable, nickname, status, current_order_id,
       last_heartbeat_at, notes, created_at, updated_at
  FROM public.farm_bots;

-- 4. Revoke EXECUTE from anon/public on SECURITY DEFINER functions used only by edge functions
REVOKE EXECUTE ON FUNCTION public.release_bot(uuid, uuid, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assign_next_queued_order(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.lookup_balance_by_email(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assign_bot_to_order(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.confirm_bot_invite(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.refund_order_remainder(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stop_order_partial(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_balance_to_order(uuid, text, integer, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.transfer_balance_between_emails(uuid, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_balance_apply_authorization(uuid, text, text, text, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_balance_with_token(uuid, uuid, integer, text) FROM anon, public;
-- Also revoke from authenticated; edge functions use service_role which bypasses grants
REVOKE EXECUTE ON FUNCTION public.release_bot(uuid, uuid, boolean, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_next_queued_order(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.lookup_balance_by_email(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_bot_to_order(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_bot_invite(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_order_remainder(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.stop_order_partial(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_balance_to_order(uuid, text, integer, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_balance_between_emails(uuid, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_balance_apply_authorization(uuid, text, text, text, integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_balance_with_token(uuid, uuid, integer, text) FROM authenticated;
