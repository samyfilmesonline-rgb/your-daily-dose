ALTER TABLE public.pix_charges
  ADD COLUMN IF NOT EXISTS partner_user_id uuid;

CREATE INDEX IF NOT EXISTS pix_charges_partner_user_id_idx
  ON public.pix_charges (partner_user_id);

DROP POLICY IF EXISTS pix_charges_partner_self_read ON public.pix_charges;
CREATE POLICY pix_charges_partner_self_read
  ON public.pix_charges
  FOR SELECT
  TO authenticated
  USING (partner_user_id = auth.uid());