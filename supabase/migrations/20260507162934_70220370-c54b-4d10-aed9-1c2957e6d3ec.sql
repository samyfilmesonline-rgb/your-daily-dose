-- Plano C: transferência/uso de saldo entre e-mails (somente fingerprint, sem e-mail)

-- Tabela de autorizações temporárias para uso de saldo de outro e-mail num pedido
CREATE TABLE IF NOT EXISTS public.partner_balance_apply_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  from_email text NOT NULL,
  to_email text NOT NULL,
  fingerprint text NOT NULL,
  max_credits integer NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_balance_apply_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pbaa_admin_all" ON public.partner_balance_apply_authorizations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "pbaa_partner_select" ON public.partner_balance_apply_authorizations
  FOR SELECT TO authenticated
  USING (partner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_pbaa_partner_to_email ON public.partner_balance_apply_authorizations(partner_id, to_email);

-- Função: lookup de saldo por e-mail antigo, exigindo fingerprint
CREATE OR REPLACE FUNCTION public.lookup_balance_by_email(
  _partner_id uuid,
  _from_email text,
  _fingerprint text
) RETURNS TABLE (credits integer, fingerprint_match boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.partner_customer_balances;
BEGIN
  SELECT * INTO v_row FROM public.partner_customer_balances
   WHERE partner_id = _partner_id AND customer_email = lower(_from_email)
   LIMIT 1;
  IF v_row.id IS NULL THEN
    RETURN QUERY SELECT 0, false;
    RETURN;
  END IF;
  RETURN QUERY SELECT v_row.credits,
    (v_row.client_fingerprint IS NOT NULL AND v_row.client_fingerprint = _fingerprint);
END $$;

-- Função: transferir saldo de um e-mail para outro (mesmo parceiro), exige fingerprint match
CREATE OR REPLACE FUNCTION public.transfer_balance_between_emails(
  _partner_id uuid,
  _from_email text,
  _to_email text,
  _fingerprint text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_from public.partner_customer_balances;
  v_amount integer;
BEGIN
  IF lower(_from_email) = lower(_to_email) THEN
    RAISE EXCEPTION 'E-mails iguais';
  END IF;

  SELECT * INTO v_from FROM public.partner_customer_balances
   WHERE partner_id = _partner_id AND customer_email = lower(_from_email)
   FOR UPDATE;
  IF v_from.id IS NULL OR v_from.credits <= 0 THEN
    RAISE EXCEPTION 'Sem saldo no e-mail informado';
  END IF;
  IF v_from.client_fingerprint IS NULL OR v_from.client_fingerprint <> _fingerprint THEN
    RAISE EXCEPTION 'Fingerprint inválido';
  END IF;

  v_amount := v_from.credits;

  UPDATE public.partner_customer_balances
     SET credits = 0, updated_at = now()
   WHERE id = v_from.id;

  INSERT INTO public.partner_customer_balances (partner_id, customer_email, client_fingerprint, credits)
  VALUES (_partner_id, lower(_to_email), _fingerprint, v_amount)
  ON CONFLICT (partner_id, customer_email)
  DO UPDATE SET credits = public.partner_customer_balances.credits + EXCLUDED.credits,
                client_fingerprint = COALESCE(public.partner_customer_balances.client_fingerprint, EXCLUDED.client_fingerprint),
                updated_at = now();

  INSERT INTO public.partner_credit_ledger (partner_id, customer_email, order_id, delta, reason)
  VALUES (_partner_id, lower(_from_email), NULL, -v_amount, 'transfer_out:' || lower(_to_email));
  INSERT INTO public.partner_credit_ledger (partner_id, customer_email, order_id, delta, reason)
  VALUES (_partner_id, lower(_to_email), NULL, v_amount, 'transfer_in:' || lower(_from_email));

  RETURN v_amount;
END $$;

-- Função: criar autorização "apply only" (debita saldo de from_email num pedido futuro de to_email)
CREATE OR REPLACE FUNCTION public.create_balance_apply_authorization(
  _partner_id uuid,
  _from_email text,
  _to_email text,
  _fingerprint text,
  _max_credits integer,
  _token_hash text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_from public.partner_customer_balances;
  v_id uuid;
BEGIN
  SELECT * INTO v_from FROM public.partner_customer_balances
   WHERE partner_id = _partner_id AND customer_email = lower(_from_email);
  IF v_from.id IS NULL OR v_from.credits <= 0 THEN
    RAISE EXCEPTION 'Sem saldo no e-mail informado';
  END IF;
  IF v_from.client_fingerprint IS NULL OR v_from.client_fingerprint <> _fingerprint THEN
    RAISE EXCEPTION 'Fingerprint inválido';
  END IF;

  INSERT INTO public.partner_balance_apply_authorizations
    (partner_id, from_email, to_email, fingerprint, max_credits, token_hash, expires_at)
  VALUES
    (_partner_id, lower(_from_email), lower(_to_email), _fingerprint,
     LEAST(_max_credits, v_from.credits), _token_hash, now() + interval '15 minutes')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Função: aplicar saldo de um from_email a um pedido, validando token
CREATE OR REPLACE FUNCTION public.apply_balance_with_token(
  _partner_id uuid,
  _order_id uuid,
  _amount integer,
  _token_hash text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_auth public.partner_balance_apply_authorizations;
  v_bal public.partner_customer_balances;
  v_order public.partner_credit_orders;
  v_apply integer;
BEGIN
  SELECT * INTO v_auth FROM public.partner_balance_apply_authorizations
   WHERE token_hash = _token_hash AND partner_id = _partner_id
   FOR UPDATE;
  IF v_auth.id IS NULL THEN RAISE EXCEPTION 'Autorização inválida'; END IF;
  IF v_auth.used_at IS NOT NULL THEN RAISE EXCEPTION 'Autorização já utilizada'; END IF;
  IF v_auth.expires_at < now() THEN RAISE EXCEPTION 'Autorização expirada'; END IF;

  SELECT * INTO v_order FROM public.partner_credit_orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.partner_id <> _partner_id THEN
    RAISE EXCEPTION 'Pedido inválido';
  END IF;
  IF lower(v_order.customer_email) <> v_auth.to_email THEN
    RAISE EXCEPTION 'Pedido não corresponde ao e-mail destino';
  END IF;

  v_apply := LEAST(_amount, v_auth.max_credits);

  SELECT * INTO v_bal FROM public.partner_customer_balances
   WHERE partner_id = _partner_id AND customer_email = v_auth.from_email
   FOR UPDATE;
  IF v_bal.id IS NULL OR v_bal.credits < v_apply THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;

  UPDATE public.partner_customer_balances
     SET credits = credits - v_apply, updated_at = now()
   WHERE id = v_bal.id;

  UPDATE public.partner_balance_apply_authorizations
     SET used_at = now(), used_order_id = _order_id
   WHERE id = v_auth.id;

  INSERT INTO public.partner_credit_ledger (partner_id, customer_email, order_id, delta, reason)
  VALUES (_partner_id, v_auth.from_email, _order_id, -v_apply,
          'applied_to_order_for:' || v_auth.to_email);

  RETURN v_apply;
END $$;