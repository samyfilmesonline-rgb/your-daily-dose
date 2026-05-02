ALTER TABLE public.contas_lovable
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS whatsapp text;