ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_checkout_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  method TEXT NOT NULL CHECK (method IN ('card', 'mobile_money')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'BIF',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'succeeded', 'failed', 'cancelled', 'expired')),
  checkout_url TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_reference)
);

CREATE INDEX IF NOT EXISTS payment_attempts_order_id_idx
  ON public.payment_attempts(order_id);

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_attempts_customer_read" ON public.payment_attempts;
CREATE POLICY "payment_attempts_customer_read" ON public.payment_attempts
  FOR SELECT USING (
    order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid())
  );

DROP POLICY IF EXISTS "payment_attempts_organizer_read" ON public.payment_attempts;
CREATE POLICY "payment_attempts_organizer_read" ON public.payment_attempts
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE organizer_id IN (SELECT id FROM public.organizers WHERE user_id = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.set_payment_attempt_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_payment_attempt_updated_at_on_payment_attempt ON public.payment_attempts;
CREATE TRIGGER set_payment_attempt_updated_at_on_payment_attempt
BEFORE UPDATE ON public.payment_attempts
FOR EACH ROW EXECUTE FUNCTION public.set_payment_attempt_updated_at();

CREATE INDEX IF NOT EXISTS orders_payment_reference_idx
  ON public.orders(payment_provider, payment_reference)
  WHERE payment_reference IS NOT NULL;
