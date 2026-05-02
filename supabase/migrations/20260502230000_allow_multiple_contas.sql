-- Permitir múltiplas contas Lovable por usuário
ALTER TABLE public.contas_lovable
  DROP CONSTRAINT IF EXISTS contas_lovable_id_do_usuario_key;

CREATE INDEX IF NOT EXISTS contas_lovable_id_do_usuario_idx
  ON public.contas_lovable (id_do_usuario);

CREATE OR REPLACE FUNCTION public.set_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contas_lovable_set_atualizado_em ON public.contas_lovable;
CREATE TRIGGER contas_lovable_set_atualizado_em
BEFORE UPDATE ON public.contas_lovable
FOR EACH ROW
EXECUTE FUNCTION public.set_atualizado_em();
