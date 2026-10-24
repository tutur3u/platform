-- Idempotent habit tracker writes for retried and concurrent assistant calls.
--
-- Both columns are new and nullable, so existing rows (including any duplicate
-- trackers already in the data) all carry NULL keys and cannot collide with the
-- partial unique indexes below. Only writes that opt in with a key are
-- deduplicated; ordinary UI writes keep their current behaviour.

alter table public.workspace_habit_trackers
  add column if not exists creation_key text;

alter table public.workspace_habit_trackers
  drop constraint if exists workspace_habit_trackers_creation_key_format;

alter table public.workspace_habit_trackers
  add constraint workspace_habit_trackers_creation_key_format
  check (
    creation_key is null
    or creation_key ~ '^[A-Za-z0-9:_-]{8,128}$'
  );

-- One active tracker per (workspace, creator, creation key). Archiving or
-- deactivating the tracker releases the key so a new one can be created.
create unique index if not exists idx_workspace_habit_trackers_creation_key_active
  on public.workspace_habit_trackers (ws_id, created_by, creation_key)
  where creation_key is not null and archived_at is null and is_active;

alter table public.workspace_habit_tracker_entries
  add column if not exists idempotency_key text;

alter table public.workspace_habit_tracker_entries
  drop constraint if exists workspace_habit_tracker_entries_idempotency_key_format;

alter table public.workspace_habit_tracker_entries
  add constraint workspace_habit_tracker_entries_idempotency_key_format
  check (
    idempotency_key is null
    or idempotency_key ~ '^[A-Za-z0-9:_-]{8,128}$'
  );

-- A repeated operation key for the same tracker member returns the stored entry.
create unique index if not exists idx_workspace_habit_tracker_entries_idempotency_key
  on public.workspace_habit_tracker_entries (tracker_id, user_id, idempotency_key)
  where idempotency_key is not null;
