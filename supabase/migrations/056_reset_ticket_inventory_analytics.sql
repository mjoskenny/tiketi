-- Reset denormalized inventory counters after the platform data purge.
-- Preserve ticket tier definitions and capacities, but start sold analytics at zero.
UPDATE public.ticket_tiers
SET sold = 0;
