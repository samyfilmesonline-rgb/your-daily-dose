ALTER TABLE public.partner_credit_orders
  ADD COLUMN IF NOT EXISTS multi_workspace_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workspaces_total integer,
  ADD COLUMN IF NOT EXISTS workspaces_done integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS workspaces_plan jsonb,
  ADD COLUMN IF NOT EXISTS current_workspace text,
  ADD COLUMN IF NOT EXISTS price_cents_per_workspace integer;

CREATE INDEX IF NOT EXISTS idx_pco_multi_ws ON public.partner_credit_orders (multi_workspace_mode) WHERE multi_workspace_mode = true;