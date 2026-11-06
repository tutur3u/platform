-- Topic announcement teacher assignment schema (inert; no caller is wired yet).
--
-- 1. Four columns on private.topic_announcements: the Vietnamese teacher in
--    charge, the course book, an optional lesson video link, and send_due_at
--    (session start in the workspace timezone minus 24 hours, set on write).
--    Late status is derived on read: sent_at is null and now() > send_due_at.
-- 2. The topic may be empty while the announcement is a draft, so supervisors
--    can create sessions before the teacher writes the topic. Every other
--    status still requires a non-blank topic.
-- 3. Two partial indexes: teacher assignment lookups (which also serve the
--    teacher foreign key's ON DELETE SET NULL) and the late-status filter.
-- 4. A trigger rejecting a teacher from another workspace. workspace_users has
--    no (id, ws_id) unique key, so a composite foreign key is not possible;
--    this mirrors the existing topic announcement scope guards.
-- 5. A 'topic_assigned' notification type. The current list is read from the
--    catalog and extended, so this migration composes with any other migration
--    that redefines notifications_type_check before or after it.
--
-- Both replaced check constraints are added NOT VALID and are not validated
-- here, so no table scan runs under ACCESS EXCLUSIVE. They still apply to every
-- new or updated row.
--
-- The tables are service-role only, so no policy or grant changes are needed.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table private.topic_announcements
  add column teacher_workspace_user_id uuid
    references public.workspace_users(id) on update cascade on delete set null,
  add column course_book text,
  add column video_url text,
  add column send_due_at timestamptz,
  add constraint topic_announcements_course_book_length check (
    course_book is null or char_length(course_book) <= 200
  ),
  add constraint topic_announcements_video_url_check check (
    video_url is null
    or (
      video_url ~ '^https://[^[:space:]]+$'
      and char_length(video_url) <= 2000
    )
  );

comment on column private.topic_announcements.teacher_workspace_user_id is
  'Workspace user (Vietnamese teacher) in charge of writing and sending this topic. Must belong to ws_id.';
comment on column private.topic_announcements.course_book is
  'Course book used in the session, shown in the topic email.';
comment on column private.topic_announcements.video_url is
  'Optional https lesson video link included in the topic email.';
comment on column private.topic_announcements.send_due_at is
  'Send deadline: session start in the workspace timezone minus 24 hours, set on write. Late is derived on read (sent_at is null and now() > send_due_at).';

alter table private.topic_announcements
  alter column topic drop not null;

alter table private.topic_announcements
  drop constraint topic_announcements_topic_not_blank;

-- Left NOT VALID on purpose: validating here would scan the table while this
-- transaction holds ACCESS EXCLUSIVE. New and updated rows are still checked,
-- and every existing row already satisfies it (the old non-blank rule was
-- enforced until now). Validate later, if ever, in its own migration, which
-- takes only SHARE UPDATE EXCLUSIVE.
alter table private.topic_announcements
  add constraint topic_announcements_topic_ready_check check (
    status = 'draft'
    or (topic is not null and length(btrim(topic)) > 0)
  ) not valid;

create index topic_announcements_teacher_session_idx
  on private.topic_announcements (
    teacher_workspace_user_id,
    ws_id,
    session_date
  )
  where teacher_workspace_user_id is not null;

create index topic_announcements_ws_send_due_idx
  on private.topic_announcements (ws_id, send_due_at)
  where send_due_at is not null;

create function private.topic_announcements_teacher_same_workspace()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  if new.teacher_workspace_user_id is not null and not exists (
    select 1
    from public.workspace_users workspace_user
    where workspace_user.id = new.teacher_workspace_user_id
      and workspace_user.ws_id = new.ws_id
  ) then
    raise exception 'teacher_workspace_user_id does not belong to ws_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.topic_announcements_teacher_same_workspace()
  from public, anon, authenticated;

create trigger topic_announcements_teacher_same_workspace
  before insert or update of teacher_workspace_user_id, ws_id
  on private.topic_announcements
  for each row
  execute function private.topic_announcements_teacher_same_workspace();

do $$
declare
  current_comment text;
  current_types text[];
begin
  select array_agg(match[1] order by ordinality)
    into current_types
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

  if 'topic_assigned' = any(current_types) then
    return;
  end if;

  select obj_description(constraint_row.oid, 'pg_constraint')
    into current_comment
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.notifications'::regclass
    and constraint_row.conname = 'notifications_type_check';

  alter table public.notifications
    drop constraint notifications_type_check;

  -- Left NOT VALID on purpose: validating here would scan public.notifications
  -- while the DROP/ADD holds ACCESS EXCLUSIVE. New rows are still checked, and
  -- the new list is a superset of the old one, so existing rows already pass.
  -- Validate later, if ever, in its own migration (SHARE UPDATE EXCLUSIVE).
  execute format(
    'alter table public.notifications add constraint notifications_type_check check (type in (%s)) not valid',
    (
      select string_agg(quote_literal(type_name), ', ' order by position)
      from unnest(current_types || array['topic_assigned']) with ordinality as types(type_name, position)
    )
  );

  execute format(
    'comment on constraint notifications_type_check on public.notifications is %L',
    coalesce(current_comment, 'Validates notification types.')
  );
end;
$$;

notify pgrst, 'reload schema';
