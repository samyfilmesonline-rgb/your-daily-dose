-- 1) Enum de status
CREATE TYPE public.parceiro_status AS ENUM ('pendente','ativo','suspenso');

-- 2) Tabela parceiros
CREATE TABLE public.parceiros (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text,
  whatsapp text,
  status public.parceiro_status NOT NULL DEFAULT 'pendente',
  limite_clientes integer NOT NULL DEFAULT 50,
  limite_workspaces integer NOT NULL DEFAULT 100,
  limite_creditos numeric NOT NULL DEFAULT 1000,
  creditos_consumidos numeric NOT NULL DEFAULT 0,
  aprovado_em timestamptz,
  aprovado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;

-- 3) RLS
CREATE POLICY parceiros_self_select ON public.parceiros
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY parceiros_self_update ON public.parceiros
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR (
      auth.uid() = user_id
      AND status = (SELECT status FROM public.parceiros WHERE user_id = auth.uid())
      AND limite_clientes = (SELECT limite_clientes FROM public.parceiros WHERE user_id = auth.uid())
      AND limite_workspaces = (SELECT limite_workspaces FROM public.parceiros WHERE user_id = auth.uid())
      AND limite_creditos = (SELECT limite_creditos FROM public.parceiros WHERE user_id = auth.uid())
    )
  );

CREATE POLICY parceiros_admin_insert ON public.parceiros
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY parceiros_admin_delete ON public.parceiros
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 4) Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_parceiros_atualizado_em()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.set_parceiros_atualizado_em() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_parceiros_atualizado
BEFORE UPDATE ON public.parceiros
FOR EACH ROW EXECUTE FUNCTION public.set_parceiros_atualizado_em();

-- 5) Função: parceiro está ativo?
CREATE OR REPLACE FUNCTION public.parceiro_ativo(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parceiros
    WHERE user_id = _user_id
      AND status = 'ativo'
      AND creditos_consumidos < limite_creditos
  ) OR public.has_role(_user_id,'admin');
$$;
REVOKE ALL ON FUNCTION public.parceiro_ativo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parceiro_ativo(uuid) TO authenticated;

-- 6) Atualizar handle_new_user para criar linha em parceiros
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  IF lower(NEW.email) = 'endersonaguiartrader@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.parceiros (user_id, status) VALUES (NEW.id, 'ativo')
      ON CONFLICT (user_id) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.parceiros (user_id, status) VALUES (NEW.id, 'pendente')
      ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 7) Recalcular creditos_consumidos a partir do resumo
CREATE OR REPLACE FUNCTION public.recalc_parceiro_creditos(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total numeric;
BEGIN
  SELECT COALESCE(SUM(total_creditos_farmados),0) INTO total
  FROM public.resumo_lovable_workspace WHERE id_do_usuario = _user_id;

  UPDATE public.parceiros
     SET creditos_consumidos = total,
         status = CASE
           WHEN status = 'ativo' AND total >= limite_creditos THEN 'suspenso'::public.parceiro_status
           ELSE status
         END
   WHERE user_id = _user_id;
END $$;
REVOKE ALL ON FUNCTION public.recalc_parceiro_creditos(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_recalc_parceiro_creditos()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_parceiro_creditos(OLD.id_do_usuario);
  ELSE
    PERFORM public.recalc_parceiro_creditos(NEW.id_do_usuario);
    IF TG_OP='UPDATE' AND OLD.id_do_usuario IS DISTINCT FROM NEW.id_do_usuario THEN
      PERFORM public.recalc_parceiro_creditos(OLD.id_do_usuario);
    END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.tg_recalc_parceiro_creditos() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_recalc_parceiro_creditos
AFTER INSERT OR UPDATE OR DELETE ON public.resumo_lovable_workspace
FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_parceiro_creditos();

-- 8) Bloqueio em INSERT de execucoes_lovable
CREATE OR REPLACE FUNCTION public.tg_bloqueia_execucao_se_inativo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.parceiro_ativo(NEW.id_do_usuario) THEN
    RAISE EXCEPTION 'Parceiro inativo, suspenso ou sem créditos disponíveis.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_bloqueia_execucao_se_inativo() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_bloqueia_execucao_se_inativo
BEFORE INSERT ON public.execucoes_lovable
FOR EACH ROW EXECUTE FUNCTION public.tg_bloqueia_execucao_se_inativo();

-- 9) Backfill: cria parceiros para usuários existentes
INSERT INTO public.parceiros (user_id, status, aprovado_em)
SELECT
  p.id,
  CASE WHEN public.has_role(p.id,'admin') THEN 'ativo'::public.parceiro_status
       ELSE 'pendente'::public.parceiro_status END,
  CASE WHEN public.has_role(p.id,'admin') THEN now() ELSE NULL END
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

-- Recalcular créditos consumidos para todos
DO $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT user_id FROM public.parceiros LOOP
    PERFORM public.recalc_parceiro_creditos(u);
  END LOOP;
END $$;

-- 10) Índices
CREATE INDEX IF NOT EXISTS idx_parceiros_status ON public.parceiros(status);
