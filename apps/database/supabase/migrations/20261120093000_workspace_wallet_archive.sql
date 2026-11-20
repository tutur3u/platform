-- Archived wallets keep their history and balances; clients hide them from
-- day-to-day lists such as wallet checkpoints. Null means active.
alter table private.workspace_wallets
  add column archived_at timestamptz;
