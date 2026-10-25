-- Short metadata-only DDL: commit before scanning the existing tracker table.
set lock_timeout = '5s';

alter table public.workspace_habit_trackers
  add column if not exists creation_key text;

alter table public.workspace_habit_trackers
  drop constraint if exists workspace_habit_trackers_creation_key_format;

alter table public.workspace_habit_trackers
  add constraint workspace_habit_trackers_creation_key_format
  check (
    creation_key is null
    or creation_key ~ '^[A-Za-z0-9:_-]{8,128}$'
  ) not valid;

reset lock_timeout;
