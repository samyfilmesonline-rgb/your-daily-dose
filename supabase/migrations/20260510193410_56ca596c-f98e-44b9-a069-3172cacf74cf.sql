
ALTER TABLE public.partner_order_schedules
  ALTER COLUMN workspaces DROP NOT NULL,
  ALTER COLUMN workspaces SET DEFAULT '[]'::jsonb;
