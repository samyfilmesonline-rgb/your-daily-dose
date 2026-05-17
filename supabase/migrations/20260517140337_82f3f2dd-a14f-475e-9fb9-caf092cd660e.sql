
-- 1) Trigger que rejeita workspace com nome de rótulo de status
CREATE OR REPLACE FUNCTION public.tg_block_status_like_workspace()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  blacklist text[] := ARRAY[
    'em andamento','processando','aguardando','aguardando pagamento',
    'aguardando worker','aguardando workspace','aguardando convite',
    'pending','processing','queued','paid','waiting',
    'waiting_invite','waiting_workspace','delivered','failed','refunded','expired'
  ];
  v_target text := lower(trim(coalesce(NEW.target_workspace,'')));
  v_current text := lower(trim(coalesce(NEW.current_workspace,'')));
BEGIN
  IF NEW.target_workspace IS NOT NULL AND v_target <> '' AND v_target = ANY(blacklist) THEN
    RAISE EXCEPTION 'target_workspace inválido: % parece um rótulo de status', NEW.target_workspace
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.current_workspace IS NOT NULL AND v_current <> '' AND v_current = ANY(blacklist) THEN
    RAISE EXCEPTION 'current_workspace inválido: % parece um rótulo de status', NEW.current_workspace
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_block_status_like_workspace ON public.partner_credit_orders;
CREATE TRIGGER trg_block_status_like_workspace
BEFORE INSERT OR UPDATE OF target_workspace, current_workspace
ON public.partner_credit_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_block_status_like_workspace();
