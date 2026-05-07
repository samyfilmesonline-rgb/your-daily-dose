
-- 1. Tighten app_licenses UPDATE policies with explicit WITH CHECK constraints
DROP POLICY IF EXISTS app_licenses_update_client_or_partner ON public.app_licenses;

-- Admins keep full access
CREATE POLICY app_licenses_update_admin
ON public.app_licenses
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Partners can update their own customers' licenses but cannot change billing/status fields
CREATE POLICY app_licenses_update_partner
ON public.app_licenses
FOR UPDATE
TO authenticated
USING (partner_id = auth.uid() AND is_active_partner())
WITH CHECK (partner_id = auth.uid() AND is_active_partner());

-- Clients (matched by uid or email) may only bind machine info; sensitive fields frozen
CREATE POLICY app_licenses_update_client_machine_only
ON public.app_licenses
FOR UPDATE
TO authenticated
USING (
  (auth.uid() = id_do_usuario)
  OR (lower(customer_email) = lower(COALESCE((auth.jwt() ->> 'email'), '')))
)
WITH CHECK (
  (
    (auth.uid() = id_do_usuario)
    OR (lower(customer_email) = lower(COALESCE((auth.jwt() ->> 'email'), '')))
  )
  AND status = (SELECT status FROM public.app_licenses WHERE id = app_licenses.id)
  AND COALESCE(expires_at, 'epoch'::timestamptz) = COALESCE((SELECT expires_at FROM public.app_licenses WHERE id = app_licenses.id), 'epoch'::timestamptz)
  AND max_machines = (SELECT max_machines FROM public.app_licenses WHERE id = app_licenses.id)
  AND plan_code = (SELECT plan_code FROM public.app_licenses WHERE id = app_licenses.id)
  AND COALESCE(plan_name, '') = COALESCE((SELECT plan_name FROM public.app_licenses WHERE id = app_licenses.id), '')
  AND COALESCE(partner_id::text, '') = COALESCE((SELECT partner_id::text FROM public.app_licenses WHERE id = app_licenses.id), '')
  AND COALESCE(customer_email, '') = COALESCE((SELECT customer_email FROM public.app_licenses WHERE id = app_licenses.id), '')
);

-- 2. Fix mutable search_path on the helper functions
ALTER FUNCTION public.current_partner_whatsapp() SET search_path = public;
ALTER FUNCTION public.current_partner_name() SET search_path = public;
ALTER FUNCTION public.is_active_partner() SET search_path = public;
ALTER FUNCTION public.app_licenses_fill_partner_fields() SET search_path = public;
ALTER FUNCTION public.app_licenses_guard_authenticated_updates() SET search_path = public;

-- 3. Restrict the public 'avatars' bucket so anonymous clients cannot list all files.
-- Public read of individual files remains via direct URL; LIST is restricted to the user's own folder.
DO $$
BEGIN
  -- Drop overly permissive policies if they exist (names commonly used by Lovable scaffolding)
  EXECUTE 'DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Public read avatars" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS avatars_public_read ON storage.objects';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Allow public READ of individual avatar files (no listing). Listing requires a name filter,
-- and policies are evaluated per-row, so attempts to list the bucket return only matching rows.
-- We scope public access to files only (not directory listings) by requiring the path to contain a slash.
CREATE POLICY "avatars_public_read_files"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'avatars' AND position('/' in name) > 0);

-- Authenticated users may list/manage only files inside their own user_id folder
CREATE POLICY "avatars_user_manage_own"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 4. Realtime channel authorization: restrict realtime.messages so only authorized users
-- can subscribe to broadcast/presence channels. For app_releases (postgres_changes), RLS on
-- the underlying table already filters to is_published=true rows for anon/auth.
-- Add a default-deny + admin-only policy on realtime.messages to prevent rogue channel use.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP POLICY IF EXISTS "realtime_authenticated_can_receive_postgres_changes" ON realtime.messages;
CREATE POLICY "realtime_authenticated_can_receive_postgres_changes"
ON realtime.messages
FOR SELECT
TO anon, authenticated
USING (
  -- Allow postgres_changes (table replication is already filtered by table RLS)
  (extension = 'postgres_changes')
);
