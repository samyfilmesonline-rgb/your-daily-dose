ALTER TYPE order_schedule_end_mode ADD VALUE IF NOT EXISTS 'total_credits';

ALTER TABLE public.partner_order_schedules
  ADD COLUMN IF NOT EXISTS total_credits_target integer;

CREATE OR REPLACE FUNCTION public.tg_validate_order_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.multi_workspace_mode THEN
    IF NEW.price_cents_per_workspace IS NULL OR NEW.price_cents_per_workspace <= 0 THEN
      RAISE EXCEPTION 'price_cents_per_workspace obrigatório (>0) para multi-workspace';
    END IF;
  ELSE
    IF NEW.target_workspace IS NULL OR length(btrim(NEW.target_workspace)) = 0 THEN
      RAISE EXCEPTION 'target_workspace obrigatório para single-workspace';
    END IF;
    IF NEW.credits_per_run IS NULL OR NEW.credits_per_run <= 0 THEN
      RAISE EXCEPTION 'credits_per_run obrigatório (>0) para single-workspace';
    END IF;
    IF NEW.amount_cents_per_run IS NULL OR NEW.amount_cents_per_run < 0 THEN
      RAISE EXCEPTION 'amount_cents_per_run obrigatório (>=0) para single-workspace';
    END IF;
  END IF;

  IF NEW.end_mode = 'days' AND (NEW.total_days IS NULL OR NEW.total_days <= 0) THEN
    RAISE EXCEPTION 'total_days obrigatório (>0) quando end_mode=days';
  END IF;
  IF NEW.end_mode = 'until_date' AND NEW.end_at IS NULL THEN
    RAISE EXCEPTION 'end_at obrigatório quando end_mode=until_date';
  END IF;
  IF NEW.end_mode = 'total_credits' THEN
    IF NEW.multi_workspace_mode THEN
      RAISE EXCEPTION 'end_mode=total_credits não suportado em multi-workspace';
    END IF;
    IF NEW.total_credits_target IS NULL OR NEW.total_credits_target <= 0 THEN
      RAISE EXCEPTION 'total_credits_target obrigatório (>0) quando end_mode=total_credits';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;