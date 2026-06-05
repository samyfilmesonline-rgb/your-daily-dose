-- Helper: how many credits a workspace already received in the last 24h (rolling window, global by workspace name).
CREATE OR REPLACE FUNCTION public.workspace_farmed_last_24h(_workspace text)
RETURNS int
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(GREATEST(creditos_adicionados, 0)), 0)::int
  FROM public.execucoes_lovable
  WHERE lower(btrim(workspace_nome)) = lower(btrim(_workspace))
    AND iniciado_em >= now() - interval '24 hours'
    AND (
      creditos_adicionados > 0
      OR lower(coalesce(status,'')) IN ('sucesso','concluido','limite')
    );
$$;

-- Helper: returns the timestamp at which the workspace will be allowed to receive credits again.
-- Returns NULL if the workspace already received < 20 credits in the rolling 24h window.
CREATE OR REPLACE FUNCTION public.workspace_cooldown_until(_workspace text)
RETURNS timestamptz
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT
      COALESCE(SUM(GREATEST(creditos_adicionados, 0)), 0)::int AS farmed,
      MIN(iniciado_em) AS earliest_in_window
    FROM public.execucoes_lovable
    WHERE lower(btrim(workspace_nome)) = lower(btrim(_workspace))
      AND iniciado_em >= now() - interval '24 hours'
      AND (
        creditos_adicionados > 0
        OR lower(coalesce(status,'')) IN ('sucesso','concluido','limite')
      )
  )
  SELECT CASE
    WHEN farmed >= 20 AND earliest_in_window IS NOT NULL
      THEN earliest_in_window + interval '24 hours'
    ELSE NULL
  END
  FROM agg;
$$;

GRANT EXECUTE ON FUNCTION public.workspace_farmed_last_24h(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_cooldown_until(text) TO authenticated, service_role;

-- Index to keep the helpers cheap.
CREATE INDEX IF NOT EXISTS execucoes_lovable_ws_iniciado_idx
  ON public.execucoes_lovable ((lower(btrim(workspace_nome))), iniciado_em DESC);