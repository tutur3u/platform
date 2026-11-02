#!/usr/bin/env bash
set -euo pipefail
# PGHOST/PGPORT/PGUSER/PGDATABASE must point to a fresh disposable database.
cd "$(dirname "$0")"
psql -X -v ON_ERROR_STOP=1 -f c1-org-links-bootstrap.sql
psql -X -v ON_ERROR_STOP=1 -f ../supabase/migrations/20261103060000_workspace_user_org_links.sql
result=$(psql -X -At -v ON_ERROR_STOP=1 -f workspace-user-org-links.test.sql)
printf '%s\n' "$result"
if [[ "$result" == *'not ok'* || "$result" != *'1..31'* ]]; then exit 1; fi
psql -X -v ON_ERROR_STOP=1 -f ../rollback/20261103060000_workspace_user_org_links.sql
psql -X -At -v ON_ERROR_STOP=1 -c "SELECT CASE WHEN to_regclass('public.workspace_user_org_links') IS NULL AND to_regprocedure('private.guard_workspace_user_org_link()') IS NULL THEN 'rollback ok' ELSE 'rollback FAILED' END" | tee /dev/stderr | grep -qx 'rollback ok'
psql -X -v ON_ERROR_STOP=1 -f ../supabase/migrations/20261103060000_workspace_user_org_links.sql
result=$(psql -X -At -v ON_ERROR_STOP=1 -f workspace-user-org-links.test.sql)
printf '%s\n' "$result"
if [[ "$result" == *'not ok'* || "$result" != *'1..31'* ]]; then exit 1; fi
