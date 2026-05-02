-- Restrict EXECUTE on SECURITY DEFINER helpers in public schema.
-- rls_auto_enable is an event trigger function and never needs to be called
-- directly from the API by anon/authenticated roles.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
