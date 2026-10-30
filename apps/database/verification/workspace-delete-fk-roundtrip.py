#!/usr/bin/env python3
"""Rehearse part D on its disposable local Supabase DB, leaving main restored.

Run from the repository root under ttr resources run. The container must be an
isolated workspace-delete project, never a shared, staging or production DB.
Dump files can contain schema definitions; keep the output directory private.
"""
import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess

DATABASE = Path(__file__).resolve().parents[1]
INDEX = "20261030110000_workspace_delete_fk_cascade_concurrent"
SWAP = "20261030110010_workspace_delete_fk_cascade_guard"
ROLLBACK = "20261030110010_workspace_delete_fk_cascade_guard"
VALIDATE = "20261030110020_validate_workspace_delete_fk_cascade"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"supabase_db_tt-workspace-delete-[a-z0-9-]+", args.container):
        parser.error("Refusing a container outside the isolated workspace-delete project")
    os.umask(0o077)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    docker = ["docker", "exec", "-i", args.container]
    psql = docker + ["psql", "-X", "-U", "postgres", "-d", "postgres",
                     "-At", "-v", "ON_ERROR_STOP=1"]

    def run(command, sql=None):
        return subprocess.run(command, input=sql, text=True, capture_output=True,
                              check=True).stdout

    def apply(relative, validation=False, concurrent=False):
        sql = (DATABASE / relative).read_text()
        if validation:
            # Assert lock mode inside the validation transaction, before COMMIT.
            guard = """
do $$ begin
  if exists (select 1 from pg_locks where pid=pg_backend_pid()
    and mode='AccessExclusiveLock' and relation in (
      'public.workspaces'::regclass, 'public.realtime_log_aggregations'::regclass,
      'public.workspace_documents'::regclass, 'private.team_members'::regclass)) then
    raise exception 'Validation retained an ACCESS EXCLUSIVE swap lock';
  end if;
end $$;
"""
            if re.search(r"commit;\s*$", sql, re.IGNORECASE):
                sql = re.sub(r"commit;\s*$", lambda _: guard + "commit;\n", sql,
                             flags=re.IGNORECASE)
            else:
                sql += guard
        # Every phase is a separate connection/transaction. Never wrap the
        # rollback swap and its later validation in one transaction.
        run(psql + ([] if concurrent else ["--single-transaction"]), sql)

    def state(expected_action, validated):
        actual = run(psql, """
select conname::text || ':' || confdeltype::text || ':' || convalidated::text
from pg_constraint where
 (conrelid='public.realtime_log_aggregations'::regclass
  and conname='realtime_log_aggregations_ws_id_fkey') or
 (conrelid='public.workspace_documents'::regclass
  and conname='workspace_documents_ws_id_fkey') or
 (conrelid='private.team_members'::regclass
  and conname='project_members_project_id_fkey') order by conname;
""")
        expected = (
            f"project_members_project_id_fkey:{expected_action[2]}:{validated}\n"
            f"realtime_log_aggregations_ws_id_fkey:{expected_action[0]}:{validated}\n"
            f"workspace_documents_ws_id_fkey:{expected_action[1]}:{validated}\n"
        )
        if actual != expected:
            raise AssertionError(f"Unexpected constraint state: {actual}")

    def dump(label):
        # A fixed pg_dump restrict key removes random client guard tokens at the
        # source. Compare the complete unmodified dump bytes, including grants.
        result = subprocess.run(docker + ["pg_dump", "-U", "postgres", "-d", "postgres",
                                "--schema-only", "--restrict-key=WorkspaceDeleteRoundtrip"],
                                capture_output=True, check=True).stdout
        (args.output_dir / f"{label}.sql").write_bytes(result)
        return result

    def identical(before, after, label):
        if before != after:
            raise AssertionError(f"Schema dump mismatch: {label}; inspect private dump files")
        print(f"PASS {label}: {len(after)} bytes, sha256={hashlib.sha256(after).hexdigest()}")

    def regression(label):
        output = run(psql, (DATABASE / "supabase/tests/workspace-delete-fk-cascade.sql").read_text())
        (args.output_dir / f"{label}.tap").write_text(output)
        if re.search(r"^not ok|^Bail out!|^# Looks like", output, re.MULTILINE):
            raise AssertionError(f"Behavior regression failed: {label}")
        if "1..30" not in output:
            raise AssertionError(f"Incomplete behavior regression: {label}")
        print(f"PASS {label}: 30 pgTAP assertions")

    state("naa", "true")
    original = dump("main-before")
    apply(f"supabase/migrations/{INDEX}.sql", concurrent=True)
    apply(f"supabase/migrations/{SWAP}.sql")
    state("ccc", "false")
    swapped = dump("swap-first")
    regression("swap-not-valid")
    apply(f"supabase/migrations/{VALIDATE}.sql", validation=True)
    state("ccc", "true")
    validated = dump("validated-first")
    regression("validated")
    apply(f"rollbacks/{VALIDATE}.rollback.sql")
    state("ccc", "false")
    identical(swapped, dump("validation-down"), "validation down restores NOT VALID schema")
    apply(f"rollbacks/{ROLLBACK}.rollback.sql")
    state("naa", "false")
    original_not_valid = dump("rollback-swap-not-valid")
    apply(f"rollbacks/{ROLLBACK}.rollback-validate.sql", validation=True)
    state("naa", "true")
    apply(f"rollbacks/{INDEX}.rollback.sql", concurrent=True)
    identical(original, dump("swap-down"), "two-step D down restores exact main schema")
    apply(f"supabase/migrations/{INDEX}.sql", concurrent=True)
    apply(f"supabase/migrations/{SWAP}.sql")
    state("ccc", "false")
    identical(swapped, dump("swap-second"), "D up-down-up is byte-identical")
    apply(f"supabase/migrations/{VALIDATE}.sql", validation=True)
    state("ccc", "true")
    identical(validated, dump("validated-second"), "validation up-down-up is byte-identical")
    apply(f"rollbacks/{ROLLBACK}.rollback.sql")
    state("naa", "false")
    identical(original_not_valid, dump("rollback-swap-second"),
              "rollback NOT VALID swaps are byte-identical")
    apply(f"rollbacks/{ROLLBACK}.rollback-validate.sql", validation=True)
    state("naa", "true")
    apply(f"rollbacks/{INDEX}.rollback.sql", concurrent=True)
    identical(original, dump("main-after"), "rehearsal leaves exact main schema restored")


if __name__ == "__main__":
    main()
