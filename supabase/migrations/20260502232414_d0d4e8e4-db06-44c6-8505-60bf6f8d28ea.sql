-- 1. Add conta_id linking workspaces to contas_lovable
ALTER TABLE public.execucoes_lovable
  ADD COLUMN IF NOT EXISTS conta_id uuid REFERENCES public.contas_lovable(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_execucoes_lovable_conta_id ON public.execucoes_lovable(conta_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_lovable_user_conta ON public.execucoes_lovable(id_do_usuario, conta_id);

-- 2. Backfill conta_id from email match
UPDATE public.execucoes_lovable e
SET conta_id = c.id
FROM public.contas_lovable c
WHERE e.conta_id IS NULL
  AND c.id_do_usuario = e.id_do_usuario
  AND lower(c.email_lovable) = lower(e.email_lovable);

-- 3. DELETE policy for own workspaces
DROP POLICY IF EXISTS execucoes_lovable_delete_own ON public.execucoes_lovable;
CREATE POLICY execucoes_lovable_delete_own
  ON public.execucoes_lovable
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id_do_usuario);

-- 4. Ensure updated_at trigger is attached
DROP TRIGGER IF EXISTS trg_execucoes_lovable_atualizado_em ON public.execucoes_lovable;
CREATE TRIGGER trg_execucoes_lovable_atualizado_em
  BEFORE UPDATE ON public.execucoes_lovable
  FOR EACH ROW
  EXECUTE FUNCTION public.set_execucoes_lovable_atualizado_em();
