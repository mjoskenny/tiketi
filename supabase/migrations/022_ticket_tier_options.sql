ALTER TABLE public.ticket_tiers
  ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'consumable',
  ADD COLUMN IF NOT EXISTS extra_info TEXT,
  ADD COLUMN IF NOT EXISTS expires_at DATE,
  ADD COLUMN IF NOT EXISTS group_size INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.ticket_tiers
  DROP CONSTRAINT IF EXISTS ticket_tiers_ticket_type_check;

ALTER TABLE public.ticket_tiers
  ADD CONSTRAINT ticket_tiers_ticket_type_check
  CHECK (ticket_type IN ('consumable', 'non_consumable'));

ALTER TABLE public.ticket_tiers
  DROP CONSTRAINT IF EXISTS ticket_tiers_group_size_check;

ALTER TABLE public.ticket_tiers
  ADD CONSTRAINT ticket_tiers_group_size_check
  CHECK (group_size > 0);
