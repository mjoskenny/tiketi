-- Ensure event policy fields exist in databases created before the policy migration.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS refund_policy TEXT DEFAULT 'Tickets are non-refundable',
  ADD COLUMN IF NOT EXISTS entry_policy TEXT DEFAULT 'Valid ID required at entry',
  ADD COLUMN IF NOT EXISTS tags TEXT[];

ALTER TABLE public.ticket_tiers
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Ask PostgREST to discard its stale schema cache immediately.
NOTIFY pgrst, 'reload schema';