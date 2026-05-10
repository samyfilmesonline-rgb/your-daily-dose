
-- Enum para status da programação
DO $$ BEGIN
  CREATE TYPE public.order_schedule_status AS ENUM ('active', 'paused', 'completed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_schedule_end_mode AS ENUM ('days', 'until_date');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.partner_order_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  created_by uuid,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_whatsapp text,
  notes text,
  workspaces jsonb NOT NULL,
  price_cents_per_workspace integer NOT NULL CHECK (price_cents_per_workspace >= 1),
  start_at timestamptz NOT NULL,
  end_mode public.order_schedule_end_mode NOT NULL,
  total_days integer,
  end_at timestamptz,
  status public.order_schedule_status NOT NULL DEFAULT 'active',
  next_run_at timestamptz NOT NULL,
  last_run_at timestamptz,
  runs_completed integer NOT NULL DEFAULT 0,
  runs_failed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (end_mode = 'days' AND total_days IS NOT NULL AND total_days BETWEEN 1 AND 365)
    OR (end_mode = 'until_date' AND end_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pos_partner ON public.partner_order_schedules(partner_id);
CREATE INDEX IF NOT EXISTS idx_pos_next_run ON public.partner_order_schedules(status, next_run_at);

ALTER TABLE public.partner_order_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY pos_admin_all ON public.partner_order_schedules
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY pos_partner_select ON public.partner_order_schedules
  FOR SELECT TO authenticated
  USING (partner_id = auth.uid());

CREATE POLICY pos_partner_insert ON public.partner_order_schedules
  FOR INSERT TO authenticated
  WITH CHECK (partner_id = auth.uid() AND is_active_partner());

CREATE POLICY pos_partner_update ON public.partner_order_schedules
  FOR UPDATE TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

CREATE POLICY pos_partner_delete ON public.partner_order_schedules
  FOR DELETE TO authenticated
  USING (partner_id = auth.uid());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_partner_order_schedules_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_pos_updated_at ON public.partner_order_schedules;
CREATE TRIGGER trg_pos_updated_at BEFORE UPDATE ON public.partner_order_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_partner_order_schedules_updated_at();

-- Colunas em partner_credit_orders para vincular à programação
ALTER TABLE public.partner_credit_orders
  ADD COLUMN IF NOT EXISTS schedule_id uuid,
  ADD COLUMN IF NOT EXISTS schedule_run_index integer;

CREATE INDEX IF NOT EXISTS idx_pco_schedule ON public.partner_credit_orders(schedule_id);

-- pg_cron + pg_net job
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- (não criamos a chamada cron.schedule aqui pois ela usa anon key específica do projeto;
--  ela será inserida via tool insert separadamente se necessário)
