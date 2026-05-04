-- 1) Garantir search_path imutável em funções que ainda não têm
CREATE OR REPLACE FUNCTION public.set_execucoes_lovable_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.set_resumo_lovable_workspace_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- 2) Revogar EXECUTE público das funções SECURITY DEFINER que servem apenas a triggers
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_resumo_lovable_workspace(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_sync_resumo_lovable_workspace() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_conta_id_execucoes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_execucoes_lovable_atualizado_em() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_resumo_lovable_workspace_atualizado_em() FROM PUBLIC, anon, authenticated;
