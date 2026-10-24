-- Keep this concurrent index as the only statement in this migration.
create index concurrently if not exists devbox_run_events_unsequenced_idx
on private.devbox_run_events (run_id) where seq is null;
