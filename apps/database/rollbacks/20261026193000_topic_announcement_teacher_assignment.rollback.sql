-- Rollback for 20261026193000_topic_announcement_teacher_assignment.sql.
-- Drops the teacher, course book, video link and send deadline columns (their
-- data is lost), the indexes and the same-workspace trigger, and restores the
-- non-blank topic rule. Refuses to run while any announcement has no topic:
-- NOT NULL cannot be deferred, so complete or delete those drafts first.
-- Removes only 'topic_assigned' from the notification type list, so it is safe
-- whatever other migrations changed that list. Existing topic_assigned
-- notifications are kept: the constraint stays NOT VALID while any remain, so
-- new rows of the removed type are still rejected.
-- Not a migration: apply manually only with release-authority approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if exists (
    select 1 from private.topic_announcements where topic is null
  ) then
    raise exception 'topic announcements without a topic exist; complete or delete those drafts before rolling back';
  end if;
end;
$$;

drop trigger if exists topic_announcements_teacher_same_workspace
  on private.topic_announcements;
drop function if exists private.topic_announcements_teacher_same_workspace();

drop index if exists private.topic_announcements_teacher_session_idx;
drop index if exists private.topic_announcements_ws_send_due_idx;

alter table private.topic_announcements
  drop constraint if exists topic_announcements_topic_ready_check;

alter table private.topic_announcements
  alter column topic set not null;

alter table private.topic_announcements
  add constraint topic_announcements_topic_not_blank
    check (length(btrim(topic)) > 0) not valid;

do $$
begin
  if not exists (
    select 1
    from private.topic_announcements
    where length(btrim(topic)) = 0
  ) then
    alter table private.topic_announcements
      validate constraint topic_announcements_topic_not_blank;
  end if;
end;
$$;

alter table private.topic_announcements
  drop column if exists teacher_workspace_user_id,
  drop column if exists course_book,
  drop column if exists video_url,
  drop column if exists send_due_at;

do $$
declare
  current_comment text;
  current_types text[];
begin
  select
    array_agg(match[1] order by ordinality),
    min(obj_description(constraint_row.oid, 'pg_constraint'))
    into current_types, current_comment
  from pg_constraint constraint_row
  cross join lateral regexp_matches(
    pg_get_constraintdef(constraint_row.oid),
    '''([a-z0-9_]+)''',
    'g'
  ) with ordinality as matches(match, ordinality)
  where constraint_row.conrelid = 'public.notifications'::regclass
    and constraint_row.conname = 'notifications_type_check';

  if current_types is null or cardinality(current_types) = 0 then
    raise exception 'notifications_type_check is missing or has no types';
  end if;

  if not ('topic_assigned' = any(current_types)) then
    return;
  end if;

  alter table public.notifications
    drop constraint notifications_type_check;

  execute format(
    'alter table public.notifications add constraint notifications_type_check check (type in (%s)) not valid',
    (
      select string_agg(quote_literal(type_name), ', ' order by position)
      from unnest(array_remove(current_types, 'topic_assigned')) with ordinality as types(type_name, position)
    )
  );

  if not exists (
    select 1 from public.notifications where type = 'topic_assigned'
  ) then
    alter table public.notifications
      validate constraint notifications_type_check;
  end if;

  execute format(
    'comment on constraint notifications_type_check on public.notifications is %L',
    coalesce(current_comment, 'Validates notification types.')
  );
end;
$$;

notify pgrst, 'reload schema';

commit;
