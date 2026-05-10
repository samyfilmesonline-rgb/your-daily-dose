
-- 1. Tabela
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('partner_order','pix_charge')),
  source_id uuid NOT NULL,
  event_type text NOT NULL,
  customer_email text,
  customer_name text,
  customer_whatsapp text,
  partner_id uuid,
  amount_cents integer,
  credits integer,
  status_before text,
  status_after text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON public.payment_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_email ON public.payment_events (lower(customer_email));
CREATE INDEX IF NOT EXISTS idx_payment_events_whatsapp ON public.payment_events (customer_whatsapp);
CREATE INDEX IF NOT EXISTS idx_payment_events_partner ON public.payment_events (partner_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_event_type ON public.payment_events (event_type);
CREATE INDEX IF NOT EXISTS idx_payment_events_source ON public.payment_events (source, source_id);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_events_admin_select ON public.payment_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. Trigger function: partner_credit_orders
CREATE OR REPLACE FUNCTION public.tg_payment_events_pco()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
  v_old text;
  v_new text;
BEGIN
  v_new := NEW.status::text;
  IF TG_OP = 'INSERT' THEN
    v_old := NULL;
    IF NEW.pix_copy_paste IS NOT NULL OR NEW.pix_qrcode IS NOT NULL THEN
      v_event := 'pix_generated';
    ELSIF NEW.is_manual THEN
      v_event := 'order_created';
    ELSE
      v_event := 'order_created';
    END IF;
  ELSE
    v_old := OLD.status::text;
    IF v_old = v_new THEN
      RETURN NEW;
    END IF;
    v_event := CASE v_new
      WHEN 'paid' THEN 'paid'
      WHEN 'failed' THEN 'failed'
      WHEN 'canceled' THEN 'canceled'
      WHEN 'expired' THEN 'expired'
      WHEN 'refunded' THEN 'refunded'
      WHEN 'delivered' THEN 'delivered'
      WHEN 'queued' THEN 'queued'
      WHEN 'processing' THEN 'processing'
      ELSE 'status_change'
    END;
  END IF;

  INSERT INTO public.payment_events
    (source, source_id, event_type, customer_email, customer_name, customer_whatsapp,
     partner_id, amount_cents, credits, status_before, status_after, metadata)
  VALUES
    ('partner_order', NEW.id, v_event, NEW.customer_email, NEW.customer_name, NEW.customer_whatsapp,
     NEW.partner_id, NEW.amount_cents, NEW.credits, v_old, v_new,
     jsonb_build_object(
       'is_manual', NEW.is_manual,
       'tx_id', NEW.tx_id,
       'failed_reason', NEW.failed_reason,
       'target_workspace', NEW.target_workspace
     ));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_payment_events_pco ON public.partner_credit_orders;
CREATE TRIGGER tg_payment_events_pco
AFTER INSERT OR UPDATE ON public.partner_credit_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_payment_events_pco();

-- 3. Trigger function: pix_charges
CREATE OR REPLACE FUNCTION public.tg_payment_events_pix()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
  v_old text;
  v_new text;
BEGIN
  v_new := NEW.status;
  IF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_event := 'pix_generated';
  ELSE
    v_old := OLD.status;
    IF v_old = v_new THEN RETURN NEW; END IF;
    v_event := CASE v_new
      WHEN 'paid' THEN 'paid'
      WHEN 'failed' THEN 'failed'
      WHEN 'canceled' THEN 'canceled'
      WHEN 'expired' THEN 'expired'
      ELSE 'status_change'
    END;
  END IF;

  INSERT INTO public.payment_events
    (source, source_id, event_type, customer_email, customer_name, customer_whatsapp,
     partner_id, amount_cents, credits, status_before, status_after, metadata)
  VALUES
    ('pix_charge', NEW.id, v_event, NEW.customer_email, NEW.customer_name, NEW.customer_whatsapp,
     NEW.partner_user_id, NEW.amount_cents, NULL, v_old, v_new,
     jsonb_build_object('tx_id', NEW.tx_id, 'pack_id', NEW.pack_id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_payment_events_pix ON public.pix_charges;
CREATE TRIGGER tg_payment_events_pix
AFTER INSERT OR UPDATE ON public.pix_charges
FOR EACH ROW EXECUTE FUNCTION public.tg_payment_events_pix();

-- 4. Backfill snapshot
INSERT INTO public.payment_events
  (source, source_id, event_type, customer_email, customer_name, customer_whatsapp,
   partner_id, amount_cents, credits, status_before, status_after, metadata, created_at)
SELECT 'partner_order', id, 'snapshot', customer_email, customer_name, customer_whatsapp,
       partner_id, amount_cents, credits, NULL, status::text,
       jsonb_build_object('is_manual', is_manual, 'tx_id', tx_id, 'failed_reason', failed_reason),
       COALESCE(updated_at, created_at)
FROM public.partner_credit_orders;

INSERT INTO public.payment_events
  (source, source_id, event_type, customer_email, customer_name, customer_whatsapp,
   partner_id, amount_cents, credits, status_before, status_after, metadata, created_at)
SELECT 'pix_charge', id, 'snapshot', customer_email, customer_name, customer_whatsapp,
       partner_user_id, amount_cents, NULL, NULL, status,
       jsonb_build_object('tx_id', tx_id, 'pack_id', pack_id),
       COALESCE(updated_at, created_at)
FROM public.pix_charges;
