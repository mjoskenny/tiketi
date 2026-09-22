-- Irreversible data purge requested by the owner.
-- Preserves organizers, events, and ticket tiers.

BEGIN;

-- Remove notifications before their referenced users/organizers/events.
DELETE FROM public.notifications;

-- Remove commission records and agent sales before their parent orders.
DELETE FROM public.commission_ledger;
DELETE FROM public.agent_withdrawals;
DELETE FROM public.commissions;
DELETE FROM public.agent_sales;

-- Remove ticket purchase records and the financial order records.
DELETE FROM public.tickets;
DELETE FROM public.order_items;
DELETE FROM public.transactions;
DELETE FROM public.orders;
DELETE FROM public.customers;

-- Remove social and team-management records.
DELETE FROM public.organizer_followers;
DELETE FROM public.agent_invitations;
DELETE FROM public.agent_assignments;
DELETE FROM public.organizer_members;
DELETE FROM public.organizer_roles;

COMMIT;
