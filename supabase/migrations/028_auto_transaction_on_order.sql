-- Record confirmed ticket sales in the organizer transaction ledger automatically.
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_order_transaction_on_order ON public.orders;
CREATE TRIGGER create_order_transaction_on_order
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.create_order_transaction();