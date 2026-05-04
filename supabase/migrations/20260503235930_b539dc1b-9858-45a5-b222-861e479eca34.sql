CREATE OR REPLACE FUNCTION public.recalc_resumo_lovable_workspace(
  p_id_do_usuario uuid, p_email text, p_workspace text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  IF p_workspace IS NULL OR p_email IS NULL THEN RETURN; END IF;

  WITH execs AS (
    SELECT
      id, status, creditos_finais, creditos_adicionados, atualizado_em, iniciado_em,
      CASE
        WHEN status IN ('concluido','sucesso') THEN 'sucesso'
        WHEN status IN ('falha','erro')        THEN 'falha'
        WHEN status = 'limite'                  THEN 'limite'
        ELSE NULL
      END AS status_norm
    FROM public.execucoes_lovable
    WHERE id_do_usuario = p_id_do_usuario
      AND email_lovable = p_email
      AND workspace_nome = p_workspace
  ),
  terminais AS (
    SELECT * FROM execs WHERE status_norm IS NOT NULL ORDER BY iniciado_em DESC LIMIT 1
  )
  SELECT
    (SELECT COUNT(*)::int FROM execs) AS total_execucoes,
    (SELECT COUNT(*)::int FROM execs WHERE status_norm='sucesso') AS total_sucessos,
    (SELECT COUNT(*)::int FROM execs WHERE status_norm='limite')  AS total_limites,
    (SELECT COUNT(*)::int FROM execs WHERE status_norm='falha')   AS total_falhas,
    (SELECT COALESCE(SUM(creditos_adicionados),0) FROM execs)     AS total_creditos_farmados,
    (SELECT creditos_finais FROM terminais)                       AS ultimo_creditos_finais,
    (SELECT status_norm FROM terminais)                           AS ultima_execucao_status,
    (SELECT id FROM terminais)                                    AS ultima_execucao_id,
    (SELECT MAX(atualizado_em) FROM execs)                        AS atualizado_em
  INTO r;

  IF r.total_execucoes = 0 THEN
    DELETE FROM public.resumo_lovable_workspace
     WHERE id_do_usuario = p_id_do_usuario
       AND email_lovable = p_email
       AND workspace_nome = p_workspace;
    RETURN;
  END IF;

  INSERT INTO public.resumo_lovable_workspace AS t
    (id_do_usuario, email_lovable, workspace_nome,
     total_execucoes, total_sucessos, total_limites, total_falhas,
     total_creditos_farmados, ultimo_creditos_finais,
     ultima_execucao_status, ultima_execucao_id, atualizado_em)
  VALUES
    (p_id_do_usuario, p_email, p_workspace,
     r.total_execucoes, r.total_sucessos, r.total_limites, r.total_falhas,
     r.total_creditos_farmados, r.ultimo_creditos_finais,
     r.ultima_execucao_status, r.ultima_execucao_id, COALESCE(r.atualizado_em, now()))
  ON CONFLICT (id_do_usuario, email_lovable, workspace_nome) DO UPDATE
    SET total_execucoes = EXCLUDED.total_execucoes,
        total_sucessos = EXCLUDED.total_sucessos,
        total_limites = EXCLUDED.total_limites,
        total_falhas = EXCLUDED.total_falhas,
        total_creditos_farmados = EXCLUDED.total_creditos_farmados,
        ultimo_creditos_finais = EXCLUDED.ultimo_creditos_finais,
        ultima_execucao_status = EXCLUDED.ultima_execucao_status,
        ultima_execucao_id = EXCLUDED.ultima_execucao_id,
        atualizado_em = EXCLUDED.atualizado_em;
END $$;

CREATE OR REPLACE FUNCTION public.tg_sync_resumo_lovable_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_resumo_lovable_workspace(OLD.id_do_usuario, OLD.email_lovable, OLD.workspace_nome);
  ELSE
    PERFORM public.recalc_resumo_lovable_workspace(NEW.id_do_usuario, NEW.email_lovable, NEW.workspace_nome);
    IF TG_OP='UPDATE' AND (
      OLD.email_lovable IS DISTINCT FROM NEW.email_lovable OR
      OLD.workspace_nome IS DISTINCT FROM NEW.workspace_nome OR
      OLD.id_do_usuario IS DISTINCT FROM NEW.id_do_usuario
    ) THEN
      PERFORM public.recalc_resumo_lovable_workspace(OLD.id_do_usuario, OLD.email_lovable, OLD.workspace_nome);
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_resumo ON public.execucoes_lovable;
CREATE TRIGGER trg_sync_resumo
AFTER INSERT OR UPDATE OR DELETE ON public.execucoes_lovable
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_resumo_lovable_workspace();

-- Backfill via recalc para todas as combinações distintas
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT id_do_usuario, email_lovable, workspace_nome
    FROM public.execucoes_lovable
    WHERE workspace_nome IS NOT NULL
  LOOP
    PERFORM public.recalc_resumo_lovable_workspace(rec.id_do_usuario, rec.email_lovable, rec.workspace_nome);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.tg_set_conta_id_execucoes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conta_id IS NULL AND NEW.email_lovable IS NOT NULL THEN
    SELECT id INTO NEW.conta_id
    FROM public.contas_lovable
    WHERE id_do_usuario = NEW.id_do_usuario
      AND lower(email_lovable) = lower(NEW.email_lovable)
    LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_conta_id ON public.execucoes_lovable;
CREATE TRIGGER trg_set_conta_id
BEFORE INSERT OR UPDATE ON public.execucoes_lovable
FOR EACH ROW EXECUTE FUNCTION public.tg_set_conta_id_execucoes();

UPDATE public.execucoes_lovable e
   SET conta_id = c.id
  FROM public.contas_lovable c
 WHERE e.conta_id IS NULL
   AND e.id_do_usuario = c.id_do_usuario
   AND lower(e.email_lovable) = lower(c.email_lovable);

CREATE INDEX IF NOT EXISTS idx_exec_user_email_ws ON public.execucoes_lovable(id_do_usuario,email_lovable,workspace_nome);
CREATE INDEX IF NOT EXISTS idx_resumo_email_lower ON public.resumo_lovable_workspace((lower(email_lovable)));
CREATE INDEX IF NOT EXISTS idx_contas_email_lower ON public.contas_lovable((lower(email_lovable)));
