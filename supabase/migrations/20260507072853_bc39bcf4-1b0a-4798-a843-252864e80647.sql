create policy "app_licenses_delete_admin"
  on public.app_licenses
  for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

alter publication supabase_realtime drop table public.app_releases;