
-- ============= ENUMS =============
DO $$ BEGIN
  CREATE TYPE public.farm_bot_status AS ENUM ('idle','busy','offline','disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.partner_order_status AS ENUM (
    'pending','paid','queued','processing','delivered','failed','refunded','expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============= partner_credit_packs =============
CREATE TABLE IF NOT EXISTS public.partner_credit_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  name text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  price_cents integer NOT NULL CHECK (price_cents > 0),
  original_price_cents integer,
  badge_label text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcp_partner ON public.partner_credit_packs(partner_id);

ALTER TABLE public.partner_credit_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY pcp_public_read ON public.partner_credit_packs
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY pcp_partner_select ON public.partner_credit_packs
  FOR SELECT TO authenticated USING (partner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY pcp_partner_insert ON public.partner_credit_packs
  FOR INSERT TO authenticated WITH CHECK (partner_id = auth.uid() AND public.is_active_partner());
CREATE POLICY pcp_partner_update ON public.partner_credit_packs
  FOR UPDATE TO authenticated
  USING (partner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (partner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY pcp_partner_delete ON public.partner_credit_packs
  FOR DELETE TO authenticated
  USING (partner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.set_pcp_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_pcp_updated_at ON public.partner_credit_packs;
CREATE TRIGGER trg_pcp_updated_at BEFORE UPDATE ON public.partner_credit_packs
FOR EACH ROW EXECUTE FUNCTION public.set_pcp_updated_at();

-- ============= farm_bots =============
CREATE TABLE IF NOT EXISTS public.farm_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  email_lovable text NOT NULL,
  senha_lovable text NOT NULL,
  nickname text,
  status public.farm_bot_status NOT NULL DEFAULT 'idle',
  current_order_id uuid,
  last_heartbeat_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, email_lovable)
);
CREATE INDEX IF NOT EXISTS idx_fb_partner_status ON public.farm_bots(partner_id, status);

ALTER TABLE public.farm_bots ENABLE ROW LEVEL SECURITY;

-- Apenas admin tem acesso direto à tabela (que contém senha)
CREATE POLICY fb_admin_all ON public.farm_bots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.set_fb_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_fb_updated_at ON public.farm_bots;
CREATE TRIGGER trg_fb_updated_at BEFORE UPDATE ON public.farm_bots
FOR EACH ROW EXECUTE FUNCTION public.set_fb_updated_at();

-- View segura sem a senha, para o parceiro consultar seus bots
CREATE OR REPLACE VIEW public.farm_bots_partner_view
WITH (security_invoker = true) AS
SELECT
  id, partner_id, email_lovable, nickname, status, current_order_id,
  last_heartbeat_at, notes, created_at, updated_at
FROM public.farm_bots
WHERE partner_id = auth.uid() OR public.has_role(auth.uid(),'admin');

GRANT SELECT ON public.farm_bots_partner_view TO authenticated;

-- ============= partner_credit_orders =============
CREATE TABLE IF NOT EXISTS public.partner_credit_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  pack_id uuid REFERENCES public.partner_credit_packs(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_whatsapp text,
  customer_tax_id text,
  target_workspace text,
  credits integer NOT NULL,
  amount_cents integer NOT NULL,
  status public.partner_order_status NOT NULL DEFAULT 'pending',
  tx_id text UNIQUE,
  pix_qrcode text,
  pix_copy_paste text,
  pix_expires_at timestamptz,
  paid_at timestamptz,
  assigned_bot_id uuid REFERENCES public.farm_bots(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  delivered_at timestamptz,
  failed_reason text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pco_partner_status ON public.partner_credit_orders(partner_id, status);
CREATE INDEX IF NOT EXISTS idx_pco_tx ON public.partner_credit_orders(tx_id);

ALTER TABLE public.partner_credit_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY pco_admin_all ON public.partner_credit_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY pco_partner_select ON public.partner_credit_orders
  FOR SELECT TO authenticated USING (partner_id = auth.uid());

-- Sem INSERT/DELETE público — apenas via service role nas edge functions

CREATE OR REPLACE FUNCTION public.set_pco_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_pco_updated_at ON public.partner_credit_orders;
CREATE TRIGGER trg_pco_updated_at BEFORE UPDATE ON public.partner_credit_orders
FOR EACH ROW EXECUTE FUNCTION public.set_pco_updated_at();

-- FK current_order_id depois para evitar ciclo
ALTER TABLE public.farm_bots
  DROP CONSTRAINT IF EXISTS farm_bots_current_order_fk;
ALTER TABLE public.farm_bots
  ADD CONSTRAINT farm_bots_current_order_fk
  FOREIGN KEY (current_order_id) REFERENCES public.partner_credit_orders(id) ON DELETE SET NULL;

-- ============= Funções de fila =============
CREATE OR REPLACE FUNCTION public.assign_bot_to_order(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_partner uuid;
  v_bot uuid;
BEGIN
  SELECT partner_id INTO v_partner FROM public.partner_credit_orders
  WHERE id = _order_id FOR UPDATE;
  IF v_partner IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_bot
  FROM public.farm_bots
  WHERE partner_id = v_partner AND status = 'idle'
  ORDER BY COALESCE(last_heartbeat_at, created_at) ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_bot IS NULL THEN
    UPDATE public.partner_credit_orders
       SET status = 'queued'
     WHERE id = _order_id;
    RETURN NULL;
  END IF;

  UPDATE public.farm_bots
     SET status = 'busy', current_order_id = _order_id
   WHERE id = v_bot;

  UPDATE public.partner_credit_orders
     SET status = 'processing',
         assigned_bot_id = v_bot,
         assigned_at = now()
   WHERE id = _order_id;

  RETURN v_bot;
END $$;

CREATE OR REPLACE FUNCTION public.assign_next_queued_order(_partner_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_order uuid;
BEGIN
  SELECT id INTO v_order FROM public.partner_credit_orders
  WHERE partner_id = _partner_id AND status = 'queued'
  ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_order IS NULL THEN RETURN NULL; END IF;
  PERFORM public.assign_bot_to_order(v_order);
  RETURN v_order;
END $$;

CREATE OR REPLACE FUNCTION public.release_bot(
  _bot_id uuid, _order_id uuid, _success boolean, _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_partner uuid;
BEGIN
  SELECT partner_id INTO v_partner FROM public.farm_bots WHERE id = _bot_id;

  UPDATE public.farm_bots
     SET status = 'idle', current_order_id = NULL, last_heartbeat_at = now()
   WHERE id = _bot_id;

  UPDATE public.partner_credit_orders
     SET status = CASE WHEN _success THEN 'delivered'::public.partner_order_status
                       ELSE 'failed'::public.partner_order_status END,
         delivered_at = CASE WHEN _success THEN now() ELSE delivered_at END,
         failed_reason = CASE WHEN _success THEN NULL ELSE _reason END
   WHERE id = _order_id;

  IF v_partner IS NOT NULL THEN
    PERFORM public.assign_next_queued_order(v_partner);
  END IF;
END $$;

-- Permite que o farm py (autenticado como service role) chame as funções
REVOKE ALL ON FUNCTION public.release_bot(uuid,uuid,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_bot_to_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_next_queued_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_bot(uuid,uuid,boolean,text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_bot_to_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_next_queued_order(uuid) TO service_role;

-- ============= Realtime =============
ALTER TABLE public.partner_credit_orders REPLICA IDENTITY FULL;
ALTER TABLE public.farm_bots REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_credit_orders;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.farm_bots;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
