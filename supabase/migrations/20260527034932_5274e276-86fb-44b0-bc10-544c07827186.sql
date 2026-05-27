
CREATE TABLE public.worker_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NULL,
  bot_id uuid NULL,
  partner_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'billing_plan_checked',
    'workspace_selected',
    'captcha_required',
    'credits_farmed',
    'order_finished',
    'billing_upgrade_attempted',
    'billing_downgrade_corrected'
  )),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','action_required')),
  message text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX worker_events_order_idx ON public.worker_events (order_id, created_at DESC);
CREATE INDEX worker_events_partner_idx ON public.worker_events (partner_id, created_at DESC);
CREATE INDEX worker_events_action_idx ON public.worker_events (event_type) WHERE severity = 'action_required';

GRANT SELECT ON public.worker_events TO authenticated;
GRANT ALL ON public.worker_events TO service_role;

ALTER TABLE public.worker_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY worker_events_select_partner_or_admin
  ON public.worker_events FOR SELECT
  TO authenticated
  USING (partner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.worker_events;
ALTER TABLE public.worker_events REPLICA IDENTITY FULL;
