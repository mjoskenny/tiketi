-- Keep organizer customers in sync when pending orders are confirmed.
-- Agent and guest orders may not have a matching profile, so holder details
-- are used as the customer record when available.
CREATE OR REPLACE FUNCTION public.sync_customer_from_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_customer_id UUID;
  matched_user_id UUID;
  profile_name TEXT;
  profile_email TEXT;
  profile_phone TEXT;
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    SELECT id, full_name, email, phone
    INTO matched_user_id, profile_name, profile_email, profile_phone
    FROM public.profiles
    WHERE id = NEW.customer_id;
  END IF;

  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO existing_customer_id
  FROM public.customers
  WHERE organizer_id = NEW.organizer_id
    AND (
      (matched_user_id IS NOT NULL AND user_id = matched_user_id)
      OR (NULLIF(LOWER(TRIM(NEW.holder_email)), '') IS NOT NULL
          AND LOWER(TRIM(email)) = LOWER(TRIM(NEW.holder_email)))
    )
  ORDER BY created_at ASC
  LIMIT 1;

  IF existing_customer_id IS NULL THEN
    INSERT INTO public.customers (
      user_id, organizer_id, full_name, email, phone, total_spent, total_orders
    )
    VALUES (
      matched_user_id,
      NEW.organizer_id,
      COALESCE(NULLIF(TRIM(NEW.holder_name), ''), profile_name),
      COALESCE(NULLIF(TRIM(NEW.holder_email), ''), profile_email),
      COALESCE(NULLIF(TRIM(NEW.holder_phone), ''), profile_phone),
      NEW.total,
      1
    );
  ELSE
    UPDATE public.customers
    SET total_spent = COALESCE(total_spent, 0) + NEW.total,
        total_orders = COALESCE(total_orders, 0) + 1,
        full_name = COALESCE(NULLIF(TRIM(full_name), ''), NULLIF(TRIM(NEW.holder_name), ''), profile_name),
        email = COALESCE(NULLIF(TRIM(email), ''), NULLIF(TRIM(NEW.holder_email), ''), profile_email),
        phone = COALESCE(NULLIF(TRIM(phone), ''), NULLIF(TRIM(NEW.holder_phone), ''), profile_phone)
    WHERE id = existing_customer_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_customer_from_order_on_create ON public.orders;
DROP TRIGGER IF EXISTS sync_customer_from_order_on_confirm ON public.orders;
CREATE TRIGGER sync_customer_from_order_on_confirm
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_from_order();