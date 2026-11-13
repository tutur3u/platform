-- Manual rollback only: releases the bootstrap bindings seeded by
-- 20261111120200. Rows are marked removed (kept for audit) rather than
-- deleted. Restore STATIC_HOST_MAP on the Worker first if the hosts must keep
-- serving without the database resolver.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

UPDATE public.workspace_domains
SET status = 'removed', removed_at = now()
WHERE ws_id = '071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1'
  AND hostname IN ('vhp.ttr.gg', 'vohoangphuc.com')
  AND status <> 'removed';

COMMIT;
