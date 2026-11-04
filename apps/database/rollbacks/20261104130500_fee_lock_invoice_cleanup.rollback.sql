-- Manual rollback only: drops the compensating-cleanup function. Deploy app code
-- that no longer calls it first. No data changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP FUNCTION private.fee_lock_discard_new_invoice(UUID, UUID);

COMMIT;
