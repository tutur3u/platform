-- Keep this concurrent index as the only statement in this migration.
create unique index concurrently if not exists devbox_run_events_run_seq_idx
on private.devbox_run_events (run_id, seq);
