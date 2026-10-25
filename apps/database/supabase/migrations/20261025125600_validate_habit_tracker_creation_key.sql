set lock_timeout = '5s';

alter table public.workspace_habit_trackers
  validate constraint workspace_habit_trackers_creation_key_format;

reset lock_timeout;
