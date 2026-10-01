ALTER TABLE public.ticket_tiers
  ADD COLUMN IF NOT EXISTS consumable_amount INTEGER;

ALTER TABLE public.ticket_tiers
  ALTER COLUMN ticket_type SET DEFAULT 'non_consumable';

ALTER TABLE public.ticket_tiers
  DROP CONSTRAINT IF EXISTS ticket_tiers_consumable_amount_check;

ALTER TABLE public.ticket_tiers
  ADD CONSTRAINT ticket_tiers_consumable_amount_check
  CHECK (consumable_amount IS NULL OR consumable_amount > 0);
