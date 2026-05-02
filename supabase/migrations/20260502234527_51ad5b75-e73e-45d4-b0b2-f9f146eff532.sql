-- 1. Enum de roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 2. Tabela user_roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Tabela profiles (espelho leve de auth.users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Função has_role (SECURITY DEFINER, evita recursão)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. Trigger handle_new_user: cria profile + role inicial
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  IF lower(NEW.email) = 'endersonaguiartrader@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Backfill: criar profile + role para usuários existentes
INSERT INTO public.profiles (id, email, criado_em)
SELECT id, email, created_at FROM auth.users
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id,
  CASE WHEN lower(email) = 'endersonaguiartrader@gmail.com' THEN 'admin'::app_role
       ELSE 'user'::app_role END
FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;

-- 7. RLS profiles
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- 8. RLS user_roles
CREATE POLICY "user_roles_self_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 9. Atualizar RLS de contas_lovable: admin vê tudo
DROP POLICY IF EXISTS usuario_acessa_sua_propria_conta ON public.contas_lovable;

CREATE POLICY "contas_select" ON public.contas_lovable
  FOR SELECT TO authenticated
  USING (auth.uid() = id_do_usuario OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "contas_insert" ON public.contas_lovable
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id_do_usuario);

CREATE POLICY "contas_update" ON public.contas_lovable
  FOR UPDATE TO authenticated
  USING (auth.uid() = id_do_usuario OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = id_do_usuario OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "contas_delete" ON public.contas_lovable
  FOR DELETE TO authenticated
  USING (auth.uid() = id_do_usuario OR public.has_role(auth.uid(), 'admin'));

-- 10. Atualizar RLS de execucoes_lovable: admin vê tudo
DROP POLICY IF EXISTS execucoes_lovable_select_own ON public.execucoes_lovable;
DROP POLICY IF EXISTS execucoes_lovable_update_own ON public.execucoes_lovable;
DROP POLICY IF EXISTS execucoes_lovable_delete_own ON public.execucoes_lovable;

CREATE POLICY "execucoes_select" ON public.execucoes_lovable
  FOR SELECT TO authenticated
  USING (auth.uid() = id_do_usuario OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "execucoes_update" ON public.execucoes_lovable
  FOR UPDATE TO authenticated
  USING (auth.uid() = id_do_usuario OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = id_do_usuario OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "execucoes_delete" ON public.execucoes_lovable
  FOR DELETE TO authenticated
  USING (auth.uid() = id_do_usuario OR public.has_role(auth.uid(), 'admin'));