-- Keep this concurrent index as the only statement in this migration.
create unique index concurrently if not exists devbox_runs_actor_idempotency_key_idx
on private.devbox_runs (actor_id, idempotency_key) where idempotency_key is not null;
