-- Link a completed inventory storefront sale to the finance transaction it
-- booked, so revenue from real (Polar-paid) sales flows into the workspace
-- finance ledger. The column is the idempotency guard: a sale books at most one
-- transaction (we only insert when this is null).
--
-- Additive + nullable: existing sessions are unaffected and continue to work
-- without a linked transaction.

alter table "private"."inventory_checkout_sessions"
  add column if not exists "finance_transaction_id" uuid
  references "public"."wallet_transactions"("id") on delete set null;

create index if not exists "inventory_checkout_sessions_finance_transaction_id_idx"
  on "private"."inventory_checkout_sessions" ("finance_transaction_id");
