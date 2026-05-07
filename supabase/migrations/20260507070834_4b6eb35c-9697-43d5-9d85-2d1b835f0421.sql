
DROP POLICY IF EXISTS app_licenses_update_client_machine_only ON public.app_licenses;
CREATE POLICY app_licenses_update_client_machine_only
ON public.app_licenses FOR UPDATE TO authenticated
USING (
  auth.uid() = id_do_usuario
  OR lower(customer_email) = lower(coalesce(auth.jwt()->>'email',''))
)
WITH CHECK (
  (auth.uid() = id_do_usuario
   OR lower(customer_email) = lower(coalesce(auth.jwt()->>'email','')))
  AND status        = (SELECT o.status        FROM public.app_licenses o WHERE o.id = app_licenses.id)
  AND coalesce(expires_at,'epoch'::timestamptz) = coalesce((SELECT o.expires_at FROM public.app_licenses o WHERE o.id = app_licenses.id),'epoch'::timestamptz)
  AND max_machines  = (SELECT o.max_machines  FROM public.app_licenses o WHERE o.id = app_licenses.id)
  AND plan_code     = (SELECT o.plan_code     FROM public.app_licenses o WHERE o.id = app_licenses.id)
  AND coalesce(plan_name,'') = coalesce((SELECT o.plan_name FROM public.app_licenses o WHERE o.id = app_licenses.id),'')
  AND coalesce(partner_id::text,'') = coalesce((SELECT o.partner_id::text FROM public.app_licenses o WHERE o.id = app_licenses.id),'')
  AND customer_email = (SELECT o.customer_email FROM public.app_licenses o WHERE o.id = app_licenses.id)
  AND coalesce(customer_name,'') = coalesce((SELECT o.customer_name FROM public.app_licenses o WHERE o.id = app_licenses.id),'')
  AND coalesce(notes,'')         = coalesce((SELECT o.notes         FROM public.app_licenses o WHERE o.id = app_licenses.id),'')
);

DROP POLICY IF EXISTS app_licenses_update_partner ON public.app_licenses;
CREATE POLICY app_licenses_update_partner
ON public.app_licenses FOR UPDATE TO authenticated
USING (partner_id = auth.uid() AND is_active_partner())
WITH CHECK (
  partner_id = auth.uid() AND is_active_partner()
  AND partner_id     = (SELECT o.partner_id     FROM public.app_licenses o WHERE o.id = app_licenses.id)
  AND customer_email = (SELECT o.customer_email FROM public.app_licenses o WHERE o.id = app_licenses.id)
  AND coalesce(id_do_usuario::text,'') = coalesce((SELECT o.id_do_usuario::text FROM public.app_licenses o WHERE o.id = app_licenses.id),'')
);
