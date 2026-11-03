-- Quarantine workspace_role_permissions rows whose ws_id differs from the
-- workspace of their role so the composite (ws_id, role_id) foreign key added
-- by 20261030131000 can be validated against existing data.
--
-- The version sorts below 20261030131000 on purpose: production has not applied
-- that migration, so this one runs first. Staging already applied it; both
-- gated workflows push with `supabase db push --include-all`, which applies a
-- pending older version, so it is a no-op there (no orphans) rather than skipped.
--
-- Rows are moved, never dropped: the data-modifying CTE deletes a row only in
-- the same statement that inserts it into the quarantine table, so the copy and
-- the delete cannot diverge. The predicate is exactly the one the composite
-- foreign key rejects, which also covers a role that does not exist at all.
-- (The earlier role_id foreign key makes that case impossible, so it is
-- defensive.) The quarantine table is service_role only. Restore with
-- apps/database/rollbacks/20261030130950_quarantine_orphan_role_permissions.rollback.sql.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- LIKE copies column names, types, defaults and NOT NULL without constraints
-- or indexes, so the table stays correct if the live table gains columns.
CREATE TABLE IF NOT EXISTS private.workspace_role_permissions_orphans_20261031 (
  LIKE public.workspace_role_permissions
);

ALTER TABLE private.workspace_role_permissions_orphans_20261031
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE private.workspace_role_permissions_orphans_20261031
  ENABLE ROW LEVEL SECURITY;

-- service_role may read, add and remove quarantined rows; it never edits them.
REVOKE ALL ON TABLE private.workspace_role_permissions_orphans_20261031
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE private.workspace_role_permissions_orphans_20261031
  TO service_role;

WITH moved AS (
  DELETE FROM public.workspace_role_permissions wrp
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.workspace_roles wr
    WHERE wr.id = wrp.role_id
      AND wr.ws_id = wrp.ws_id
  )
  RETURNING wrp.*
)
INSERT INTO private.workspace_role_permissions_orphans_20261031
SELECT moved.* FROM moved;
