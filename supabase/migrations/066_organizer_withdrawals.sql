-- Organizer withdrawals reserve their balance at request time, then become a
-- completed payout only after an administrator marks the transfer as paid.
-- The transaction ledger remains the single source of truth for balances.

CREATE TABLE IF NOT EXISTS public.organizer_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES public.organizers(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('mobile_money', 'bank')),
  payment_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'paid', 'rejected', 'cancelled')),
  note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS organizer_withdrawals_organizer_status_idx
  ON public.organizer_withdrawals (organizer_id, status, requested_at DESC);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS organizer_withdrawal_id UUID REFERENCES public.organizer_withdrawals(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_organizer_withdrawal_id_key
  ON public.transactions (organizer_withdrawal_id)
  WHERE organizer_withdrawal_id IS NOT NULL;

ALTER TABLE public.organizer_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizer_withdrawals_owner_read" ON public.organizer_withdrawals;
CREATE POLICY "organizer_withdrawals_owner_read" ON public.organizer_withdrawals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = organizer_withdrawals.organizer_id
        AND organizers.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "organizer_withdrawals_admin_read" ON public.organizer_withdrawals;
CREATE POLICY "organizer_withdrawals_admin_read" ON public.organizer_withdrawals
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Keep processed refunds in the ledger so the withdrawal guard and the
-- organizer dashboard account for them consistently.
CREATE OR REPLACE FUNCTION public.record_processed_refund_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  refund_amount INTEGER;
BEGIN
  IF NEW.status <> 'processed' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT oi.unit_price
  INTO refund_amount
  FROM public.tickets t
  JOIN public.order_items oi
    ON oi.order_id = NEW.order_id
   AND oi.ticket_tier_id = t.ticket_tier_id
  WHERE t.id = NEW.ticket_id
  LIMIT 1;

  IF COALESCE(refund_amount, 0) > 0 THEN
    INSERT INTO public.transactions (order_id, organizer_id, type, amount, currency, status, reference)
    SELECT NEW.order_id, NEW.organizer_id, 'refund', refund_amount, 'BIF', 'completed', 'refund-' || NEW.id::TEXT
    WHERE NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE reference = 'refund-' || NEW.id::TEXT
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_processed_refund_transaction_on_request ON public.refund_requests;
CREATE TRIGGER record_processed_refund_transaction_on_request
AFTER UPDATE OF status ON public.refund_requests
FOR EACH ROW
EXECUTE FUNCTION public.record_processed_refund_transaction();

INSERT INTO public.transactions (order_id, organizer_id, type, amount, currency, status, reference)
SELECT rr.order_id, rr.organizer_id, 'refund', oi.unit_price, 'BIF', 'completed', 'refund-' || rr.id::TEXT
FROM public.refund_requests rr
JOIN public.tickets t ON t.id = rr.ticket_id
JOIN public.order_items oi ON oi.order_id = rr.order_id AND oi.ticket_tier_id = t.ticket_tier_id
WHERE rr.status = 'processed'
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions
    WHERE reference = 'refund-' || rr.id::TEXT
  );

CREATE OR REPLACE FUNCTION public.request_organizer_withdrawal(
  p_amount INTEGER,
  p_payment_method TEXT,
  p_payment_reference TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  organizer_row public.organizers%ROWTYPE;
  withdrawal_id UUID;
  ledger_balance INTEGER := 0;
  agent_commissions INTEGER := 0;
  available_balance INTEGER := 0;
  normalized_reference TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Withdrawal amount must be greater than zero'; END IF;
  IF p_payment_method NOT IN ('mobile_money', 'bank') THEN RAISE EXCEPTION 'Choose Mobile Money or bank transfer'; END IF;
  normalized_reference := NULLIF(TRIM(COALESCE(p_payment_reference, '')), '');
  IF normalized_reference IS NULL THEN RAISE EXCEPTION 'Enter the receiving phone number or bank account reference'; END IF;

  SELECT * INTO organizer_row
  FROM public.organizers
  WHERE user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the organizer owner can request a withdrawal'; END IF;

  -- Serialize requests for one organizer so concurrent browser tabs cannot
  -- reserve the same money twice.
  PERFORM pg_advisory_xact_lock(hashtextextended(organizer_row.id::TEXT, 0));

  SELECT COALESCE(SUM(
    CASE
      WHEN type = 'payment' AND status = 'completed' THEN amount
      WHEN type IN ('fee', 'refund') AND status = 'completed' THEN -amount
      WHEN type = 'payout' AND status IN ('pending', 'completed') THEN -amount
      ELSE 0
    END
  ), 0)::INTEGER
  INTO ledger_balance
  FROM public.transactions
  WHERE organizer_id = organizer_row.id;

  SELECT COALESCE(SUM(amount), 0)::INTEGER
  INTO agent_commissions
  FROM public.commissions
  WHERE organizer_id = organizer_row.id
    AND status IN ('pending', 'available', 'paid');

  available_balance := GREATEST(0, ledger_balance - agent_commissions);
  IF p_amount > available_balance THEN
    RAISE EXCEPTION 'Withdrawal amount exceeds your available balance of % BIF', available_balance;
  END IF;

  INSERT INTO public.organizer_withdrawals (
    organizer_id, requested_by, amount, payment_method, payment_reference, status
  )
  VALUES (
    organizer_row.id, auth.uid(), p_amount, p_payment_method, normalized_reference, 'requested'
  )
  RETURNING id INTO withdrawal_id;

  INSERT INTO public.transactions (
    organizer_id, organizer_withdrawal_id, type, amount, currency, status, reference
  )
  VALUES (
    organizer_row.id, withdrawal_id, 'payout', p_amount, 'BIF', 'pending', 'withdrawal-' || withdrawal_id::TEXT
  );

  RETURN withdrawal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_organizer_withdrawal(p_withdrawal_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  withdrawal_row public.organizer_withdrawals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  SELECT w.* INTO withdrawal_row
  FROM public.organizer_withdrawals w
  JOIN public.organizers o ON o.id = w.organizer_id
  WHERE w.id = p_withdrawal_id AND o.user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal request not found'; END IF;
  IF withdrawal_row.status <> 'requested' THEN RAISE EXCEPTION 'Only a requested withdrawal can be cancelled'; END IF;

  UPDATE public.organizer_withdrawals
  SET status = 'cancelled', processed_at = NOW(), processed_by = auth.uid()
  WHERE id = withdrawal_row.id;
  UPDATE public.transactions
  SET status = 'failed'
  WHERE organizer_withdrawal_id = withdrawal_row.id AND type = 'payout' AND status = 'pending';
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_organizer_withdrawal(
  p_withdrawal_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  withdrawal_row public.organizer_withdrawals%ROWTYPE;
  transaction_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access is required'; END IF;
  IF p_status NOT IN ('processing', 'paid', 'rejected') THEN RAISE EXCEPTION 'Choose processing, paid, or rejected'; END IF;

  SELECT * INTO withdrawal_row
  FROM public.organizer_withdrawals
  WHERE id = p_withdrawal_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal request not found'; END IF;
  IF withdrawal_row.status IN ('paid', 'rejected', 'cancelled') THEN RAISE EXCEPTION 'This withdrawal has already been finalized'; END IF;

  transaction_status := CASE WHEN p_status = 'paid' THEN 'completed' WHEN p_status = 'rejected' THEN 'failed' ELSE 'pending' END;
  UPDATE public.organizer_withdrawals
  SET status = p_status,
      note = NULLIF(TRIM(COALESCE(p_note, '')), ''),
      processed_at = CASE WHEN p_status IN ('paid', 'rejected') THEN NOW() ELSE NULL END,
      processed_by = auth.uid()
  WHERE id = withdrawal_row.id;
  UPDATE public.transactions
  SET status = transaction_status
  WHERE organizer_withdrawal_id = withdrawal_row.id AND type = 'payout';
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.request_organizer_withdrawal(INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_organizer_withdrawal(INTEGER, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_organizer_withdrawal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_organizer_withdrawal(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.review_organizer_withdrawal(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_organizer_withdrawal(UUID, TEXT, TEXT) TO authenticated;
