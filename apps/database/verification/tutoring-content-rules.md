# Tutoring content reminder rollout

Requires Selene migration/security review and Rex migration ops before merge.
The workspace kill switch is `workspace_configs.id = tutoring_content_rules`:
only the literal value `true` enables N2/N3; absent or any other value is OFF.
`config/feature-flags.json` records the same default OFF contract.
Optional workspace configs `tutoring_content_rules_n2_days` and
`tutoring_content_rules_n3_days` default to 14, accept integers 1–999.
`tutoring_content_rules_office_group` overrides admin/approve_reports recipients
with linked workspace members from that group; an empty/invalid group disables N3.
N1 remains the existing completion implementation.

After approved migration rollout, ops can opt `tutoring-content-rules` into the
existing `CRON_CONTROL_ENABLED_JOBS`. It runs daily on the existing 06:00 UTC
trigger. Each transaction scans at most 1000 notes and sends at most 1000 notices;
a private cursor advances across slots, including past unlinked students.
No new cron trigger, runner, email batch, or external channel is introduced.
The transaction runner prevents CONCURRENTLY in this single atomic migration.
The regular index build has 5s lock and 30s statement timeouts. No data backfill.
Disable both switches before rollback. Rollback refuses legacy-key collisions
without deleting receipts; ops must retain the stage schema if collisions exist.

Run fixture-only SQL tests with `TMPDIR=$PWD/.tmp python3
apps/database/verification/tutoring-content-rules-test.py` from the repository root.
The harness creates a disposable PG17 cluster with networking disabled and stops
it afterward. It uses a minimal schema, not a full Supabase reset or typegen.
