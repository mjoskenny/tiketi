-- Keep the existing service_fee_percent as the non-consumable/default rate,
-- and allow administrators to configure the other ticket categories separately.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS service_fee_consumable_percent NUMERIC(5,2) NOT NULL DEFAULT 4.00,
  ADD COLUMN IF NOT EXISTS service_fee_table_percent NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS service_fee_free_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_service_fee_consumable_percent_check,
  ADD CONSTRAINT platform_settings_service_fee_consumable_percent_check CHECK (service_fee_consumable_percent >= 0 AND service_fee_consumable_percent <= 100),
  DROP CONSTRAINT IF EXISTS platform_settings_service_fee_table_percent_check,
  ADD CONSTRAINT platform_settings_service_fee_table_percent_check CHECK (service_fee_table_percent >= 0 AND service_fee_table_percent <= 100),
  DROP CONSTRAINT IF EXISTS platform_settings_service_fee_free_percent_check,
  ADD CONSTRAINT platform_settings_service_fee_free_percent_check CHECK (service_fee_free_percent >= 0 AND service_fee_free_percent <= 100);

-- Preserve the existing configured standard rate for table tickets on rollout.
UPDATE public.platform_settings
SET service_fee_table_percent = service_fee_percent
WHERE id = TRUE;

-- Publicly expose only the four non-sensitive category rates.
CREATE OR REPLACE FUNCTION public.get_public_ticket_fee_settings()
RETURNS TABLE (
  service_fee_non_consumable_percent NUMERIC,
  service_fee_consumable_percent NUMERIC,
  service_fee_table_percent NUMERIC,
  service_fee_free_percent NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    settings.service_fee_percent,
    settings.service_fee_consumable_percent,
    settings.service_fee_table_percent,
    settings.service_fee_free_percent
  FROM public.platform_settings AS settings
  WHERE settings.id = TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_public_ticket_fee_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_ticket_fee_settings() TO anon, authenticated;

-- Recalculate commission from actual order items. Table tiers are identified
-- by group_size > 1 or a tier name containing "table". Free tiers retain a
-- configurable rate, but a percentage of a zero-price ticket has zero value.
CREATE OR REPLACE FUNCTION public.refresh_order_platform_service_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_order_id UUID;
  calculated_fee INTEGER := 0;
  order_status TEXT;
  updated_fee_rows INTEGER := 0;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_order_id := OLD.order_id;
  ELSE
    target_order_id := NEW.order_id;
  END IF;

  SELECT ROUND(COALESCE(SUM(
    COALESCE(item.total_price, 0) * CASE
      WHEN COALESCE(tier.price, item.unit_price, 0) <= 0 THEN settings.service_fee_free_percent
      WHEN COALESCE(tier.group_size, 1) > 1 OR COALESCE(tier.name, '') ILIKE '%table%' THEN settings.service_fee_table_percent
      WHEN tier.ticket_type = 'consumable' THEN settings.service_fee_consumable_percent
      ELSE settings.service_fee_percent
    END / 100.0
  ), 0))::INTEGER
  INTO calculated_fee
  FROM public.order_items AS item
  JOIN public.ticket_tiers AS tier ON tier.id = item.ticket_tier_id
  CROSS JOIN public.platform_settings AS settings
  WHERE item.order_id = target_order_id
    AND settings.id = TRUE;

  UPDATE public.orders
  SET service_fee = calculated_fee
  WHERE id = target_order_id
  RETURNING status INTO order_status;

  IF order_status = 'confirmed' THEN
    UPDATE public.transactions
    SET amount = calculated_fee
    WHERE order_id = target_order_id AND type = 'fee';
    GET DIAGNOSTICS updated_fee_rows = ROW_COUNT;

    IF calculated_fee > 0 AND updated_fee_rows = 0 THEN
      INSERT INTO public.transactions (order_id, organizer_id, type, amount, currency, status, reference)
      SELECT target_order_id, order_row.organizer_id, 'fee', calculated_fee, 'BIF', 'completed', 'fee-' || target_order_id::TEXT
      FROM public.orders AS order_row
      WHERE order_row.id = target_order_id;
    ELSIF calculated_fee = 0 THEN
      DELETE FROM public.transactions
      WHERE order_id = target_order_id AND type = 'fee';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS refresh_order_platform_service_fee_on_item ON public.order_items;
CREATE TRIGGER refresh_order_platform_service_fee_on_item
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.refresh_order_platform_service_fee();