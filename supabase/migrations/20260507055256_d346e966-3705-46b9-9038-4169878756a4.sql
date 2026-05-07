
-- Tabela de releases do app desktop
CREATE TABLE public.app_releases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  download_url TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  file_size_bytes BIGINT,
  changelog TEXT,
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  min_supported_version TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_releases_published ON public.app_releases (is_published, published_at DESC);

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

-- Leitura pública (anon + authenticated) só de releases publicadas
CREATE POLICY "app_releases_public_read_published"
  ON public.app_releases FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

-- Admin vê tudo (inclusive rascunhos)
CREATE POLICY "app_releases_admin_read_all"
  ON public.app_releases FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "app_releases_admin_insert"
  ON public.app_releases FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "app_releases_admin_update"
  ON public.app_releases FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "app_releases_admin_delete"
  ON public.app_releases FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_app_releases_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.is_published = true AND (OLD IS NULL OR OLD.is_published = false) AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_app_releases_updated_at
  BEFORE INSERT OR UPDATE ON public.app_releases
  FOR EACH ROW EXECUTE FUNCTION public.set_app_releases_updated_at();

-- Realtime
ALTER TABLE public.app_releases REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_releases;
