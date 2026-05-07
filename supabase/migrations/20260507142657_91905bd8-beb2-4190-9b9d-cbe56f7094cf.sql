
ALTER TABLE public.partner_credit_orders
  ADD COLUMN IF NOT EXISTS client_fingerprint text;

CREATE INDEX IF NOT EXISTS idx_pco_partner_fingerprint
  ON public.partner_credit_orders (partner_id, client_fingerprint);

CREATE INDEX IF NOT EXISTS idx_pco_partner_email
  ON public.partner_credit_orders (partner_id, lower(customer_email));
