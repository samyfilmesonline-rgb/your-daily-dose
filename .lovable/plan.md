## Goal

Fix the `supabase_lov` finding: partners (and clients) can UPDATE sensitive billing/status fields on `app_licenses` because the existing partner UPDATE policy only checks row ownership, not which columns changed.

## Current state

Three UPDATE policies exist on `app_licenses`:
- `app_licenses_update_admin` — admins can do anything ✅
- `app_licenses_update_partner` — `partner_id = auth.uid() AND is_active_partner()` with no field freeze ❌
- `app_licenses_update_client_machine_only` — already freezes most fields, but the WITH CHECK uses `WHERE app_licenses_1.id = app_licenses_1.id` (self-join bug → matches every row, returns arbitrary row), so the freeze doesn't actually compare against the row being updated ❌

There is also a trigger `app_licenses_guard_authenticated_updates` that already enforces field-level rules in plpgsql. It works, but defense-in-depth at the RLS layer is what the scanner expects.

## Fix (single migration)

1. **Drop & recreate `app_licenses_update_client_machine_only`** with a correct WITH CHECK that compares `NEW.*` to the existing row via `app_licenses_1.id = app_licenses.id` (not `= app_licenses_1.id`). Restrict customer writes to: `machine_hash`, `machine_hashes`, `activated_at`, `last_seen_at`, `id_do_usuario` (claim once), `updated_at`. All other columns (`status`, `expires_at`, `max_machines`, `plan_code`, `plan_name`, `partner_id`, `partner_name`, `partner_whatsapp`, `customer_email`, `customer_name`, `notes`) must equal their old values.

2. **Drop & recreate `app_licenses_update_partner`** with a WITH CHECK that:
   - Keeps `partner_id = auth.uid() AND is_active_partner()`
   - Freezes fields a partner must NOT change without admin: nothing (partners legitimately edit status/expires/plan/etc.) — BUT prevents self-escalation by freezing `partner_id` to `OLD.partner_id` and forbidding partners from reassigning a license to another partner. The scanner specifically calls out billing fields; we mirror the trigger's existing rules and additionally require that partners cannot reduce `max_machines` arbitrarily? → keep parity with the trigger: partners CAN edit status/expires/plan/max_machines/notes (this is their job), they CANNOT edit `customer_email`, `id_do_usuario` once set, or reassign `partner_id`.

   The scanner's concern is real for the *client* path; for partners we document that pricing/payment is handled out-of-band and partners legitimately manage these fields. We'll add the WITH CHECK that locks `partner_id`, `customer_email`, and `id_do_usuario` to their old values to prevent any cross-partner takeover, matching the existing trigger.

3. Mark the finding fixed with an explanation.
4. Update `mem://security-memory` (create it) noting that partner UPDATEs on `app_licenses` legitimately mutate billing fields and that field-level locks live in both the RLS WITH CHECK and the `app_licenses_guard_authenticated_updates` trigger.

## SQL sketch

```sql
DROP POLICY app_licenses_update_client_machine_only ON public.app_licenses;
CREATE POLICY app_licenses_update_client_machine_only
ON public.app_licenses FOR UPDATE TO authenticated
USING (
  auth.uid() = id_do_usuario
  OR lower(customer_email) = lower(coalesce(auth.jwt()->>'email',''))
)
WITH CHECK (
  (auth.uid() = id_do_usuario
   OR lower(customer_email) = lower(coalesce(auth.jwt()->>'email','')))
  AND status        = (SELECT status        FROM public.app_licenses o WHERE o.id = app_licenses.id)
  AND coalesce(expires_at,'epoch') = coalesce((SELECT expires_at FROM public.app_licenses o WHERE o.id = app_licenses.id),'epoch')
  AND max_machines  = (SELECT max_machines  FROM public.app_licenses o WHERE o.id = app_licenses.id)
  AND plan_code     = (SELECT plan_code     FROM public.app_licenses o WHERE o.id = app_licenses.id)
  AND coalesce(plan_name,'') = coalesce((SELECT plan_name FROM public.app_licenses o WHERE o.id = app_licenses.id),'')
  AND coalesce(partner_id::text,'') = coalesce((SELECT partner_id::text FROM public.app_licenses o WHERE o.id = app_licenses.id),'')
  AND customer_email = (SELECT customer_email FROM public.app_licenses o WHERE o.id = app_licenses.id)
  AND coalesce(customer_name,'') = coalesce((SELECT customer_name FROM public.app_licenses o WHERE o.id = app_licenses.id),'')
  AND coalesce(notes,'')         = coalesce((SELECT notes         FROM public.app_licenses o WHERE o.id = app_licenses.id),'')
);

DROP POLICY app_licenses_update_partner ON public.app_licenses;
CREATE POLICY app_licenses_update_partner
ON public.app_licenses FOR UPDATE TO authenticated
USING (partner_id = auth.uid() AND is_active_partner())
WITH CHECK (
  partner_id = auth.uid() AND is_active_partner()
  AND partner_id     = (SELECT partner_id     FROM public.app_licenses o WHERE o.id = app_licenses.id)
  AND customer_email = (SELECT customer_email FROM public.app_licenses o WHERE o.id = app_licenses.id)
  AND coalesce(id_do_usuario::text,'') = coalesce((SELECT id_do_usuario::text FROM public.app_licenses o WHERE o.id = app_licenses.id),'')
);
```

## Out of scope (other findings)

- Realtime channel auth, leaked-password protection, SECURITY DEFINER exec — separate fixes; this plan only addresses `app_licenses_update_no_field_restriction`. Tell me if you want them bundled.
