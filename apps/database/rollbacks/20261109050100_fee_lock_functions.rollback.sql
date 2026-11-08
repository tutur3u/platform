-- Manual rollback only: drops the fee lock functions (deploy with ENABLE_FEE_LOCK off
-- first). Tables and data stay; roll back 20261104130000 afterwards to remove them.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP FUNCTION private.fee_lock_reopen(UUID, UUID, UUID, INTEGER, TEXT), private.fee_lock_lock(UUID, UUID, UUID, INTEGER),
  private.fee_lock_save_draft(UUID, UUID, UUID, DATE, INTEGER, JSONB, TEXT, TEXT), private.fee_lock_claim(UUID, UUID, INTEGER, TEXT),
  private.fee_lock_baseline(UUID, DATE, UUID, TEXT), private.fee_lock_round(NUMERIC, TEXT);

COMMIT;
