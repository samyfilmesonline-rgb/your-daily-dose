CREATE POLICY "resumo_lovable_workspace_admin_select"
ON public.resumo_lovable_workspace
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "resumo_lovable_workspace_admin_delete"
ON public.resumo_lovable_workspace
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "resumo_lovable_workspace_owner_delete"
ON public.resumo_lovable_workspace
FOR DELETE TO authenticated
USING (auth.uid() = id_do_usuario);