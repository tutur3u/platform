"""Emit pgTAP SQL exercising the actual 20261030120000 owner rollback.

From repo root: python3 apps/database/scripts/mastermind-owner-rollback-test.py
Pipe to local psql with ON_ERROR_STOP=1, or save under supabase/tests for test db.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
owner = (root / "supabase/tests/manage-mastermind-owner-grant.sql").read_text()
rollback = (root / "rollbacks/20261030120000_grant_mastermind_owner.rollback.sql").read_text()
rollback = rollback.replace("BEGIN;", "", 1).replace("COMMIT;", "", 1)
target = "4d420000-0000-4000-8000-000000000002"
checks = []
for changed in (False, True):
    checks.append("savepoint rollback_case;")
    if changed:
        checks.append("update public.workspaces set creator_id = '4d420000-0000-4000-8000-000000000001' where id = '00000000-0000-0000-0000-000000000000';")
    checks.append(rollback)
    checks.append(f"select not public.has_workspace_permission('00000000-0000-0000-0000-000000000000', '{target}', 'manage_mastermind') as revoked \\gset")
    checks.append("rollback to savepoint rollback_case;")
    checks.append(f"select ok(:'revoked'::boolean, 'migration grantee revoked, creator changed={changed}');")
checks.append("savepoint later_grant;")
checks.append(f"select private.grant_mastermind_access('{target}', 'Later intentional operator grant');")
checks.append(rollback)
checks.append(f"select public.has_workspace_permission('00000000-0000-0000-0000-000000000000', '{target}', 'manage_mastermind') as preserved \\gset")
checks.append("rollback to savepoint later_grant;")
checks.append("select ok(:'preserved'::boolean, 'later intentional grant preserved');")
print(owner.replace("plan(18)", "plan(21)").replace("select * from finish();", "\n".join(checks) + "\nselect * from finish();"))
