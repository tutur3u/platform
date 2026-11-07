-- Null inherits the class campus; explicit labels belong only to this session.
set lock_timeout = '5s';
alter table private.workspace_tutoring_sessions
  add column campus_override text
  constraint workspace_tutoring_sessions_campus_override_check check (
    campus_override is null or (
      char_length(campus_override) between 1 and 80
      and campus_override = btrim(campus_override)
      and campus_override ~ '[^[:space:]]'
    )
  );
