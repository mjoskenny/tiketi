ALTER TABLE events ADD COLUMN IF NOT EXISTS refund_policy TEXT DEFAULT 'Tickets are non-refundable';
ALTER TABLE events ADD COLUMN IF NOT EXISTS entry_policy TEXT DEFAULT 'Valid ID required at entry';