-- Customers pay the ticket face value. The platform fee is retained from the
-- organizer's proceeds and recorded as a separate fee ledger entry once an
-- order is confirmed.

CREATE OR REPLACE FUNCTION public.apply_organizer_funded_platform_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  configured_fee_percent NUMERIC := 0;
BEGIN
  SELECT service_fee_percent
  INTO configured_fee_percent
  FROM public.platform_settings
  WHERE id = TRUE;

  NEW.service_fee := ROUND(COALESCE(NEW.subtotal, 0) * (COALESCE(configured_fee_percent, 0) / 100.0));
  NEW.total := COALESCE(NEW.subtotal, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_organizer_funded_platform_fee_on_order ON public.orders;
CREATE TRIGGER apply_organizer_funded_platform_fee_on_order
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.apply_organizer_funded_platform_fee();

-- This project uses test payments, so align existing orders with the same
-- policy as new sales. The customer payment is always the ticket value.
UPDATE public.orders AS order_row
SET
  service_fee = ROUND(order_row.subtotal * (settings.service_fee_percent / 100.0)),
  total = order_row.subtotal
FROM public.platform_settings AS settings
WHERE settings.id = TRUE;

UPDATE public.transactions AS transaction_row
SET amount = order_row.total
FROM public.orders AS order_row
WHERE transaction_row.order_id = order_row.id
  AND transaction_row.type = 'payment';

INSERT INTO public.transactions (order_id, organizer_id, type, amount, currency, status, reference)
SELECT order_row.id, order_row.organizer_id, 'fee', order_row.service_fee, 'BIF', 'completed', 'fee-' || order_row.id::text
FROM public.orders AS order_row
WHERE order_row.status = 'confirmed'
  AND COALESCE(order_row.service_fee, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.transactions AS transaction_row
    WHERE transaction_row.order_id = order_row.id
      AND transaction_row.type = 'fee'
  );

-- A confirmed order produces the customer payment and the organizer-funded
-- platform fee. Both records are idempotent, so retrying payment confirmation
-- cannot duplicate the ledger entries.
CREATE OR REPLACE FUNCTION public.create_order_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.transactions (order_id, organizer_id, type, amount, currency, status, reference)
    SELECT NEW.id, NEW.organizer_id, 'payment', NEW.total, 'BIF', 'completed', NEW.id::text
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.transactions
      WHERE order_id = NEW.id AND type = 'payment'
    );

    IF COALESCE(NEW.service_fee, 0) > 0 THEN
      INSERT INTO public.transactions (order_id, organizer_id, type, amount, currency, status, reference)
      SELECT NEW.id, NEW.organizer_id, 'fee', NEW.service_fee, 'BIF', 'completed', 'fee-' || NEW.id::text
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.transactions
        WHERE order_id = NEW.id AND type = 'fee'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
