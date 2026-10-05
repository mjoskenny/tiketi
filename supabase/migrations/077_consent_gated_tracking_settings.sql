-- Public tracking IDs are not secrets; the client only loads the matching vendor
-- script after the visitor grants that category of consent.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS google_analytics_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT NOT NULL DEFAULT '';

-- Configure the supplied GA4 property on first rollout without overwriting a
-- measurement ID that an administrator has already set.
UPDATE public.platform_settings
SET google_analytics_id = 'G-EV6C2Y9DHR'
WHERE id = TRUE
  AND NULLIF(BTRIM(google_analytics_id), '') IS NULL;

-- Return only the public vendor IDs alongside the existing public checkout settings.
DROP FUNCTION IF EXISTS public.get_public_platform_checkout_settings();
CREATE FUNCTION public.get_public_platform_checkout_settings()
RETURNS TABLE (
  platform_name TEXT,
  support_email TEXT,
  support_phone TEXT,
  contact_whatsapp TEXT,
  contact_address TEXT,
  checkout_notice TEXT,
  service_fee_percent NUMERIC,
  ticket_sales_enabled BOOLEAN,
  mobile_money_enabled BOOLEAN,
  card_payments_enabled BOOLEAN,
  maintenance_mode BOOLEAN,
  maintenance_message TEXT,
  marketplace_enabled BOOLEAN,
  max_tickets_per_order INTEGER,
  refund_requests_enabled BOOLEAN,
  checkin_enabled BOOLEAN,
  social_instagram_url TEXT,
  social_instagram_active BOOLEAN,
  social_facebook_url TEXT,
  social_facebook_active BOOLEAN,
  social_x_url TEXT,
  social_x_active BOOLEAN,
  social_tiktok_url TEXT,
  social_tiktok_active BOOLEAN,
  social_whatsapp_url TEXT,
  social_whatsapp_active BOOLEAN,
  google_analytics_id TEXT,
  meta_pixel_id TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    settings.platform_name,
    settings.support_email,
    COALESCE(settings.support_phone, settings.contact_phone, '+257 22 000 000') AS support_phone,
    COALESCE(settings.contact_whatsapp, '+257 22 000 000') AS contact_whatsapp,
    COALESCE(settings.contact_address, 'Bujumbura, Burundi') AS contact_address,
    settings.checkout_notice,
    settings.service_fee_percent,
    settings.ticket_sales_enabled,
    settings.mobile_money_enabled,
    settings.card_payments_enabled,
    settings.maintenance_mode,
    settings.maintenance_message,
    settings.marketplace_enabled,
    settings.max_tickets_per_order,
    settings.refund_requests_enabled,
    settings.checkin_enabled,
    settings.social_instagram_url,
    settings.social_instagram_active,
    settings.social_facebook_url,
    settings.social_facebook_active,
    settings.social_x_url,
    settings.social_x_active,
    settings.social_tiktok_url,
    settings.social_tiktok_active,
    settings.social_whatsapp_url,
    settings.social_whatsapp_active,
    settings.google_analytics_id,
    settings.meta_pixel_id
  FROM public.platform_settings AS settings
  WHERE settings.id = TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_public_platform_checkout_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_platform_checkout_settings() TO anon, authenticated;
