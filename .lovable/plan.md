## Scope

Only `warn`-level findings are addressed. The single `error`-level webhook finding and all `info` items are out of scope per the user request.

## Warn findings

### 1. `app_licenses_missing_delete_policy` — add admin DELETE policy
The `app_licenses` table has no DELETE policy, so even admins cannot remove a license. Add an explicit admin-only RLS DELETE policy mirroring the pattern used on other tables (`public.has_role(auth.uid(), 'admin')`).

### 2. `app_releases_realtime_all_subscribers` — remove from realtime publication
`app_releases` is currently in the `supabase_realtime` publication. Any subscriber receives all row changes, including unpublished drafts. The app does not rely on realtime for releases (releases are fetched on demand from the dashboard / desktop updater). Fix: drop `app_releases` from `supabase_realtime`.

### 3. `SUPA_authenticated_security_definer_function_executable` — ignore (false positive)
The flagged SECURITY DEFINER functions (`has_role`, `has_tab_access`, `parceiro_ativo`) are referenced inside RLS policies across the database. Revoking `EXECUTE` from `authenticated` would break every policy that uses them (queries would fail with permission errors). They contain no privileged side-effects — they only return booleans derived from the caller's `auth.uid()` argument. Mark this finding as **ignored** with that justification, and update the security memory so future scans don't re-raise it.

## Migration (single file)

```sql
-- Admin can delete licenses
create policy "app_licenses_delete_admin"
  on public.app_licenses
  for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Remove app_releases from realtime broadcast
alter publication supabase_realtime drop table public.app_releases;
```

## Tool actions after migration
- `manage_security_finding` → `mark_as_fixed` for `app_licenses_missing_delete_policy` and `app_releases_realtime_all_subscribers`.
- `manage_security_finding` → `ignore` for `SUPA_authenticated_security_definer_function_executable` with the justification above.
- `update_memory` to record the accepted risk (RLS helper functions remain executable to `authenticated`).

No code or frontend changes are required.