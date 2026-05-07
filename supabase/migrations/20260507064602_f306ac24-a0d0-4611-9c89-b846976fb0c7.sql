CREATE OR REPLACE FUNCTION public.set_app_releases_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_published = true AND NEW.published_at IS NULL THEN
      NEW.published_at = now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_published = true AND OLD.is_published = false THEN
      NEW.published_at = now();
    ELSIF NEW.is_published = false AND OLD.is_published = true THEN
      NEW.published_at = NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;