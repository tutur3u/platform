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

The processor checks the kill switch before its first derived write: when no
non-EC workspace has the literal `true` value it returns `{"sent":0}` without
touching the scan cursor, review episodes, receipts or notifications, even when
Cron Control calls it directly as the service role.

Review cycles: a cycle starts at the later of the latest authorized review
(`private.tutoring_weak_support_reviews`, service role only) and the note the
processor first observes for that review boundary, capped at the current time.
The processor records it in `private.tutoring_content_review_episodes`, so member
edits, toggles, reverts and replacement `user_feedbacks` rows (the API POST
inserts a new row) never move N2 or N3. Only a newer authorized review opens the
next cycle. Existing N2 history for the boundary keeps its cycle, and legacy
pre-stage weak-content receipts outside EC become N2 history. EC receipts stay
unchanged at N1.

After approved migration rollout, ops can opt `tutoring-content-rules` into the
existing `CRON_CONTROL_ENABLED_JOBS`. It runs daily on the existing 06:00 UTC
trigger. Each transaction scans at most 1000 notes and sends at most 1000 notices;
a private cursor advances across slots, including past unlinked students.
No new cron trigger, runner, email batch, or external channel is introduced.
The transaction runner prevents CONCURRENTLY in this single atomic migration.
The migration, including the legacy receipt backfill and regular index build,
has 5s lock and 30s statement timeouts. Before applying it, Rex must run
[`tutoring-content-stages-pre-run.sql`](tutoring-content-stages-pre-run.sql).
It runs read-only and reports legacy receipt counts and rows that would change,
split EC vs non-EC; EC `would_change` must be zero. The backfill joins the
receipt's group to its workspace and excludes the processor's EC identity via
its MD5 hash; receipts without a matching group are left untouched.
Disable both switches before rollback. Run the rollback standalone (no outer
transaction): phase 1 commits the processor removal before the backup phase, so a
failing backup never re-enables anything. Collisions on the legacy key are only
reported; receipts are never deleted and the stage schema is retained.

Run fixture-only SQL tests with `python3
apps/database/verification/tutoring-content-rules-test.py` from the repository root
(`TUTORING_PG_BIN` selects another local PostgreSQL bin directory and
`TUTORING_TMP` a short socket directory). The harness creates a disposable
cluster with networking disabled and stops it afterward. It uses a minimal
schema, not a full Supabase reset or typegen.

`tutoring-content-rules-real-replay.py` is the real-schema acceptance replay: a
disposable Supabase CLI stack, every committed migration through the merge base,
real auth/RLS/feedback schema, synthetic non-EC data only, then this migration
through the CLI runner, the rollback phase test and a clean full-chain install.
