-- MANUAL, DESTRUCTIVE OPERATION — do not add this file to Supabase migrations.
-- Run only after verifying the selected Supabase project and taking a backup.
-- This preserves profiles, organizers, events, ticket tiers, agent assignments,
-- invitations, and platform settings. It deletes all purchase/customer and
-- financial history, including payouts and agent commissions, and resets stock.

BEGIN;

-- Preflight counts. Review these before running the DELETE statements below.
SELECT 'orders' AS table_name, COUNT(*) AS rows_to_delete FROM public.orders
UNION ALL SELECT 'tickets', COUNT(*) FROM public.tickets
UNION ALL SELECT 'customers', COUNT(*) FROM public.customers
UNION ALL SELECT 'transactions', COUNT(*) FROM public.transactions
UNION ALL SELECT 'organizer_withdrawals', COUNT(*) FROM public.organizer_withdrawals
UNION ALL SELECT 'agent_withdrawals', COUNT(*) FROM public.agent_withdrawals
UNION ALL SELECT 'refund_requests', COUNT(*) FROM public.refund_requests
UNION ALL SELECT 'agent_sales', COUNT(*) FROM public.agent_sales
UNION ALL SELECT 'commissions', COUNT(*) FROM public.commissions
UNION ALL SELECT 'commission_ledger', COUNT(*) FROM public.commission_ledger;

-- Remove financial ledger rows before deleting rows referenced with RESTRICT.
DELETE FROM public.commission_ledger;
DELETE FROM public.commissions;
DELETE FROM public.agent_sales;
DELETE FROM public.agent_withdrawals;
DELETE FROM public.refund_requests;

-- Remove purchase-related alerts as well as payment, refund, and payout history.
DELETE FROM public.notifications
WHERE type IN ('ticket', 'payment');
DELETE FROM public.transactions;
DELETE FROM public.organizer_withdrawals;

-- order_items, tickets, and payment_attempts cascade from orders.
DELETE FROM public.orders;

-- Customer rows here are organizer CRM summaries; user profiles/auth accounts
-- are intentionally preserved.
DELETE FROM public.customers;

-- Ticket sales are removed, so restore all existing tier inventory counters.
UPDATE public.ticket_tiers SET sold = 0 WHERE sold <> 0;

COMMIT;