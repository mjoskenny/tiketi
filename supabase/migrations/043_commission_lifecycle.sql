-- Release agent commissions after the configured holding period and validate withdrawals.
-- The dashboard calls these functions when the wallet loads; all status changes happen in SQL.

CREATE OR REPLACE FUNCTION public.release_matured_agent_commissions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE released_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  UPDATE public.commissions
  SET status = 'available'
  WHERE agent_user_id = auth.uid()
    AND status = 'pending'
    AND available_at <= NOW();

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_agent_withdrawal(
  p_amount INTEGER,
  p_payment_method TEXT,
  p_payment_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  withdrawal_id UUID;
  available_balance INTEGER;
  outstanding_amount INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
  END IF;
  IF p_payment_method NOT IN ('mobile_money', 'bank') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  -- Serialize requests per agent so two simultaneous requests cannot spend
  -- the same available balance.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::TEXT, 0));
  PERFORM public.release_matured_agent_commissions();

  SELECT COALESCE(SUM(amount), 0)::INTEGER
  INTO available_balance
  FROM public.commissions
  WHERE agent_user_id = auth.uid()
    AND status = 'available';

  SELECT COALESCE(SUM(amount), 0)::INTEGER
  INTO outstanding_amount
  FROM public.agent_withdrawals
  WHERE agent_user_id = auth.uid()
    AND status IN ('requested', 'processing');

  IF p_amount > available_balance - outstanding_amount THEN
    RAISE EXCEPTION 'Withdrawal amount exceeds available commission balance';
  END IF;

  INSERT INTO public.agent_withdrawals (
    agent_user_id, amount, payment_method, payment_reference, status
  )
  VALUES (
    auth.uid(), p_amount, p_payment_method, NULLIF(TRIM(p_payment_reference), ''), 'requested'
  )
  RETURNING id INTO withdrawal_id;

  RETURN withdrawal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.release_matured_agent_commissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_matured_agent_commissions() TO authenticated;
REVOKE ALL ON FUNCTION public.request_agent_withdrawal(INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_agent_withdrawal(INTEGER, TEXT, TEXT) TO authenticated;
