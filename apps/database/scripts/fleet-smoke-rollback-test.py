"""Emit pgTAP assertions that execute both actual rollback files on a disposable database."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
fixture = "66611941-0e5a-44f2-a32b-000000000071"
workspace = "66611941-0e5a-44f2-a32b-000000000072"
owner = "66611941-0e5a-44f2-a32b-000000000073"


def rollback_sql(name):
    text = (root / "rollbacks" / name).read_text()
    assert text.count("begin;") == text.count("commit;") == 1
    return text.replace("begin;", "", 1).replace("commit;", "", 1)


def rejects(sql, constraint, label):
    return f"""select throws_ok($test$
{sql}
$test$, '23514', 'new row for relation "fleet_smoke_rollback_guard" violates check constraint "{constraint}"', '{label}');"""


def succeeds(sql, label):
    return f"""select lives_ok($test$
{sql}
$test$, '{label}');"""


identity = rollback_sql("20261120031200_fleet_smoke_identity.rollback.sql")
limits = rollback_sql("20261120032900_fleet_smoke_provision_limits.rollback.sql")
removed = "remove_fleet_smoke_identities_before_rollback"
create_workspace = f"""insert into public.workspaces (id, name, personal, creator_id)
values ('{workspace}', 'Retained rollback fixture', false, '{owner}');"""
delete_workspace = f"delete from public.workspaces where id = '{workspace}';"

print("begin;\nselect plan(5);")
print(rejects(identity, "roll_back_fleet_smoke_limits_first", "identity rollback refuses the wrong order"))
print(f"""
insert into auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('{owner}', 'fleet-smoke-rollback-owner@example.test', 'authenticated', now(), '{{}}', '{{}}');
{create_workspace}
insert into private.fleet_smoke_operations (id, state, workspace_id)
values ('{fixture}', 'retired', '{workspace}');
""")
print(rejects(limits, removed, "limits rollback refuses a leftover fixture workspace"))
print(delete_workspace)
print(succeeds(limits, "limits rollback succeeds after fixture teardown"))
print("drop table pg_temp.fleet_smoke_rollback_guard;")
print(create_workspace)
print(rejects(identity, removed, "identity rollback also refuses a leftover fixture workspace"))
print(delete_workspace)
print(succeeds(identity, "identity rollback succeeds after limits rollback and fixture teardown"))
print("select * from finish();\nrollback;")
