CREATE OR REPLACE FUNCTION public.sync_customer_from_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE existing_customer_id UUID;
BEGIN
  IF NEW.customer_id IS NULL OR NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO existing_customer_id
  FROM public.customers
  WHERE organizer_id = NEW.organizer_id
    AND user_id = NEW.customer_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF existing_customer_id IS NULL THEN
    INSERT INTO public.customers (
      user_id,
      organizer_id,
      full_name,
      email,
      phone,
      total_spent,
      total_orders
    )
    SELECT
      NEW.customer_id,
      NEW.organizer_id,
      profiles.full_name,
      profiles.email,
      profiles.phone,
      NEW.total,
      1
    FROM public.profiles
    WHERE profiles.id = NEW.customer_id;
  ELSE
    UPDATE public.customers
    SET total_spent = COALESCE(total_spent, 0) + NEW.total,
        total_orders = COALESCE(total_orders, 0) + 1,
        full_name = COALESCE(public.customers.full_name, (SELECT full_name FROM public.profiles WHERE id = NEW.customer_id)),
        email = COALESCE(public.customers.email, (SELECT email FROM public.profiles WHERE id = NEW.customer_id)),
        phone = COALESCE(public.customers.phone, (SELECT phone FROM public.profiles WHERE id = NEW.customer_id))
    WHERE id = existing_customer_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_customer_from_order_on_create ON public.orders;
CREATE TRIGGER sync_customer_from_order_on_create
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_from_order();
