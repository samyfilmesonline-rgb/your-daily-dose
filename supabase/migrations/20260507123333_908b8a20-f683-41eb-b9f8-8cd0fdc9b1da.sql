
-- Policies para parceiro em farm_bots
CREATE POLICY fb_partner_select ON public.farm_bots
  FOR SELECT TO authenticated
  USING (partner_id = auth.uid());

CREATE POLICY fb_partner_insert ON public.farm_bots
  FOR INSERT TO authenticated
  WITH CHECK (partner_id = auth.uid() AND public.is_active_partner());

CREATE POLICY fb_partner_update ON public.farm_bots
  FOR UPDATE TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

CREATE POLICY fb_partner_delete ON public.farm_bots
  FOR DELETE TO authenticated
  USING (partner_id = auth.uid());

-- Trigger guard: parceiro só pode mexer em campos seguros e status idle<->disabled
CREATE OR REPLACE FUNCTION public.farm_bots_guard_partner_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  -- admin ou service role: liberado
  IF public.has_role(auth.uid(), 'admin') OR coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- parceiro autenticado: bloqueia campos do worker
  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id THEN
    RAISE EXCEPTION 'partner_id não pode ser alterado';
  END IF;
  IF NEW.current_order_id IS DISTINCT FROM OLD.current_order_id THEN
    RAISE EXCEPTION 'current_order_id é controlado pelo worker';
  END IF;
  IF NEW.last_heartbeat_at IS DISTINCT FROM OLD.last_heartbeat_at THEN
    RAISE EXCEPTION 'last_heartbeat_at é controlado pelo worker';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status NOT IN ('idle','disabled') OR OLD.status NOT IN ('idle','disabled') THEN
      RAISE EXCEPTION 'parceiro só pode alternar entre idle e disabled';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_farm_bots_guard_updates ON public.farm_bots;
CREATE TRIGGER trg_farm_bots_guard_updates
  BEFORE UPDATE ON public.farm_bots
  FOR EACH ROW EXECUTE FUNCTION public.farm_bots_guard_partner_updates();

-- View sem senha para o frontend
CREATE OR REPLACE VIEW public.farm_bots_partner_view AS
SELECT id, partner_id, email_lovable, nickname, status,
       current_order_id, last_heartbeat_at, notes,
       created_at, updated_at
FROM public.farm_bots;

GRANT SELECT ON public.farm_bots_partner_view TO authenticated;
