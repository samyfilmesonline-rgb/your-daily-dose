## Already fixed

The previous migration on `app_licenses` replaced `app_licenses_update_client_machine_only` with a corrected WITH CHECK that freezes the sensitive fields the scanner calls out (`status`, `expires_at`, `max_machines`, `plan_code`, `plan_name`) plus `partner_id`, `customer_email`, `customer_name`, and `notes` against the existing row.

The original self-join bug (`WHERE app_licenses_1.id = app_licenses_1.id`, which matched every row) was the reason the freeze didn't work. It now reads `WHERE o.id = app_licenses.id`.

Customers matched by email retain UPDATE only to write machine activation fields: `machine_hash`, `machine_hashes`, `activated_at`, `last_seen_at`, `id_do_usuario` (claim once), `updated_at`.

## Action

Mark `app_licenses_update_client_self_escalation` as fixed via `manage_security_finding`, citing the migration. No SQL changes required.

## Out of scope

The remaining warn-level findings (Realtime channel auth, leaked-password protection, SECURITY DEFINER exec) are separate. Tell me if you want them bundled next.
