-- Tutoring automation foundation (inert; no job, route, or screen calls it yet).
--
-- 1. private.tutoring_automation_settings: one row per workspace for the
--    absence follow-up and the lesson-completion report. A missing row means
--    both are off; every flag defaults to false. Enabling a rule stamps its
--    *_enabled_at, which later jobs use to skip absences older than the
--    enablement window instead of reminding about history.
-- 2. private.tutoring_absence_followups: per absence (class, learner, date)
--    follow-up state. One reminder, then archive; staff can restore. Archive
--    hides the support-queue row only. It never archives the learner and never
--    deletes attendance, sessions, or the follow-up itself.
-- 3. private.tutoring_automation_events: append-only audit of every follow-up
--    transition and settings change, written in the same transaction.
-- 4. Two notification types, appended to the current notifications_type_check
--    list read from the catalog, so this composes with any other migration
--    that redefines the constraint before or after it.
-- 5. Two receipt kinds on private.tutoring_notification_receipts: one absence
--    reminder per follow-up and recipient, one lesson report per workspace,
--    local date and recipient.
--
-- All tables are service-role only, with RLS enabled and no client policies.
-- private.tutoring_absence_followup_apply is the only writer of follow-up
-- state that also records the audit event; a trigger enforces the state
-- machine for any other writer.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- 1. Settings ----------------------------------------------------------------

create table private.tutoring_automation_settings (
  ws_id uuid primary key
    references public.workspaces(id) on delete cascade,
  absence_followup_enabled boolean not null default false,
  absence_followup_enabled_at timestamptz,
  reminder_after_days smallint not null default 3
    constraint tutoring_automation_settings_reminder_after_days_check
      check (reminder_after_days between 1 and 60),
  archive_after_days smallint not null default 3
    constraint tutoring_automation_settings_archive_after_days_check
      check (archive_after_days between 1 and 60),
  lesson_report_enabled boolean not null default false,
  lesson_report_enabled_at timestamptz,
  consecutive_sessions smallint not null default 2
    constraint tutoring_automation_settings_consecutive_sessions_check
      check (consecutive_sessions between 2 and 5),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tutoring_automation_settings_followup_enabled_at_check check (
    not absence_followup_enabled or absence_followup_enabled_at is not null
  ),
  constraint tutoring_automation_settings_report_enabled_at_check check (
    not lesson_report_enabled or lesson_report_enabled_at is not null
  )
);

comment on table private.tutoring_automation_settings is
  'Per-workspace tutoring automation switches. No row means every rule is off.';
comment on column private.tutoring_automation_settings.absence_followup_enabled_at is
  'When the absence follow-up was last switched on. Absences older than this minus the lookback are never reminded.';
comment on column private.tutoring_automation_settings.lesson_report_enabled_at is
  'When the lesson-completion report was last switched on.';

-- 2. Absence follow-ups --------------------------------------------------------

create table private.tutoring_absence_followups (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  group_id uuid not null
    references public.workspace_user_groups(id) on delete cascade,
  student_user_id uuid not null
    references public.workspace_users(id) on delete cascade,
  absence_date date not null,
  attendance_id uuid
    references public.user_group_attendance(id) on update cascade on delete set null,
  state text not null
    constraint tutoring_absence_followups_state_check
      check (state in ('reminded', 'archived', 'restored')),
  reminded_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  archive_reason text
    constraint tutoring_absence_followups_archive_reason_check
      check (archive_reason in ('no_makeup_after_reminder', 'manual')),
  restored_at timestamptz,
  restored_by uuid references public.users(id) on delete set null,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tutoring_absence_followups_absence_key unique (
    group_id, student_user_id, absence_date
  ),
  constraint tutoring_absence_followups_shape_check check (
    (state = 'reminded' and reminded_at is not null and archived_at is null)
    or (state = 'archived' and archived_at is not null and archive_reason is not null)
    or (state = 'restored' and restored_at is not null)
  ),
  -- Only a reminded absence can be archived automatically.
  constraint tutoring_absence_followups_auto_archive_check check (
    archive_reason is distinct from 'no_makeup_after_reminder'
    or reminded_at is not null
  )
);

create index tutoring_absence_followups_ws_state_idx
  on private.tutoring_absence_followups (ws_id, state);
create index tutoring_absence_followups_student_idx
  on private.tutoring_absence_followups (student_user_id);
create index tutoring_absence_followups_attendance_idx
  on private.tutoring_absence_followups (attendance_id)
  where attendance_id is not null;

comment on table private.tutoring_absence_followups is
  'Follow-up state of one unrecovered absence: reminded once, then archived from the support queue, and restorable. Never hard-deleted by the application.';
comment on column private.tutoring_absence_followups.state is
  'reminded -> archived -> restored -> archived (staff only). A restored absence is held: only staff can archive it again.';

-- 3. Append-only audit -----------------------------------------------------------

create table private.tutoring_automation_events (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  subject_kind text not null
    constraint tutoring_automation_events_subject_kind_check
      check (subject_kind in ('absence_followup', 'lesson_report', 'settings')),
  -- No foreign key: the audit outlives its subject's later changes.
  subject_id uuid not null,
  action text not null
    constraint tutoring_automation_events_action_check
      check (action in (
        'reminded',
        'archived',
        'manually_archived',
        'restored',
        'report_generated',
        'notified',
        'skipped_recipient',
        'settings_changed'
      )),
  -- Null for the scheduled system actor. No foreign key, so deleting an
  -- account never rewrites the audit.
  actor_user_id uuid,
  run_slot text
    constraint tutoring_automation_events_run_slot_check
      check (run_slot is null or char_length(run_slot) <= 64),
  detail jsonb not null default '{}'::jsonb
    constraint tutoring_automation_events_detail_check
      check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 2048),
  created_at timestamptz not null default now()
);

create index tutoring_automation_events_subject_idx
  on private.tutoring_automation_events (ws_id, subject_kind, subject_id, created_at desc);

comment on table private.tutoring_automation_events is
  'Append-only audit of tutoring automation: follow-up transitions, notifications, and settings changes. Rows are never updated; the service role may only insert and read.';

-- 4. Functions -------------------------------------------------------------------

-- Keeps updated_at and the *_enabled_at stamps, and audits every change.
create function private.tutoring_automation_settings_track()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := pg_catalog.now();
  if new.absence_followup_enabled
     and (tg_op = 'INSERT' or not old.absence_followup_enabled) then
    new.absence_followup_enabled_at := pg_catalog.now();
  end if;
  if new.lesson_report_enabled
     and (tg_op = 'INSERT' or not old.lesson_report_enabled) then
    new.lesson_report_enabled_at := pg_catalog.now();
  end if;

  insert into private.tutoring_automation_events (
    ws_id, subject_kind, subject_id, action, actor_user_id, detail
  )
  values (
    new.ws_id, 'settings', new.ws_id, 'settings_changed', new.updated_by,
    pg_catalog.jsonb_build_object(
      'absence_followup_enabled', new.absence_followup_enabled,
      'reminder_after_days', new.reminder_after_days,
      'archive_after_days', new.archive_after_days,
      'lesson_report_enabled', new.lesson_report_enabled,
      'consecutive_sessions', new.consecutive_sessions
    )
  );
  return new;
end;
$$;

create trigger tutoring_automation_settings_track
  before insert or update on private.tutoring_automation_settings
  for each row
  execute function private.tutoring_automation_settings_track();

-- Rejects cross-workspace rows, identity rewrites, and transitions outside the
-- state machine, for every writer.
create function private.tutoring_absence_followups_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.state = 'restored' then
      raise exception 'A follow-up starts reminded or archived'
        using errcode = '23514';
    end if;
  else
    if new.ws_id is distinct from old.ws_id
       or new.group_id is distinct from old.group_id
       or new.student_user_id is distinct from old.student_user_id
       or new.absence_date is distinct from old.absence_date
       or new.created_at is distinct from old.created_at then
      raise exception 'Follow-up identity is immutable' using errcode = '23514';
    end if;
    -- One reminder per absence, ever.
    if old.reminded_at is not null
       and new.reminded_at is distinct from old.reminded_at then
      raise exception 'A follow-up is reminded at most once'
        using errcode = '23514';
    end if;
    if new.state is distinct from old.state and not (
      (old.state = 'reminded' and new.state = 'archived')
      or (old.state = 'archived' and new.state = 'restored')
      or (old.state = 'restored' and new.state = 'archived'
          and new.archive_reason = 'manual' and new.archived_by is not null)
    ) then
      raise exception 'Follow-up cannot move from % to %', old.state, new.state
        using errcode = '23514';
    end if;
    new.revision := old.revision + 1;
    new.updated_at := pg_catalog.now();
  end if;

  if not exists (
    select 1 from public.workspace_user_groups g
    where g.id = new.group_id and g.ws_id = new.ws_id
  ) or not exists (
    select 1 from public.workspace_users u
    where u.id = new.student_user_id and u.ws_id = new.ws_id
  ) then
    raise exception 'Class and learner must belong to the follow-up workspace'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tutoring_absence_followups_guard
  before insert or update on private.tutoring_absence_followups
  for each row
  execute function private.tutoring_absence_followups_guard();

create function private.tutoring_automation_events_append_only()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'Tutoring automation events are append-only'
    using errcode = '42501';
end;
$$;

create trigger tutoring_automation_events_append_only
  before update on private.tutoring_automation_events
  for each row
  execute function private.tutoring_automation_events_append_only();

-- Applies one follow-up action and records its audit event atomically.
-- p_actor_user_id null means the scheduled system actor, which is fenced by
-- the workspace setting; staff actions need a current workspace member.
-- Returns {followup_id, state, changed, skipped}. Repeating an action that
-- already took effect returns changed=false.
create function private.tutoring_absence_followup_apply(
  p_ws_id uuid,
  p_group_id uuid,
  p_student_user_id uuid,
  p_absence_date date,
  p_action text,
  p_actor_user_id uuid default null,
  p_run_slot text default null,
  p_attendance_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row private.tutoring_absence_followups%rowtype;
  v_event text;
  v_now timestamptz := pg_catalog.now();
begin
  if p_ws_id is null or p_group_id is null or p_student_user_id is null
     or p_absence_date is null
     or p_action is null or p_action not in ('remind', 'archive', 'restore') then
    raise exception 'Invalid follow-up action' using errcode = '22023';
  end if;

  if p_actor_user_id is null then
    if p_action = 'restore' then
      raise exception 'Only staff can restore a follow-up' using errcode = '42501';
    end if;
    if not exists (
      select 1 from private.tutoring_automation_settings s
      where s.ws_id = p_ws_id and s.absence_followup_enabled
    ) then
      return pg_catalog.jsonb_build_object(
        'followup_id', null, 'state', null, 'changed', false,
        'skipped', 'disabled'
      );
    end if;
  else
    if p_action = 'remind' then
      raise exception 'Only the scheduled job sends reminders'
        using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.workspace_members m
      where m.ws_id = p_ws_id and m.user_id = p_actor_user_id
    ) then
      raise exception 'Actor is not a workspace member' using errcode = '42501';
    end if;
  end if;

  select * into v_row
  from private.tutoring_absence_followups f
  where f.group_id = p_group_id
    and f.student_user_id = p_student_user_id
    and f.absence_date = p_absence_date
  for update;

  if found and v_row.ws_id <> p_ws_id then
    raise exception 'Follow-up belongs to another workspace'
      using errcode = '42501';
  end if;

  if not found then
    if p_action = 'remind' then
      insert into private.tutoring_absence_followups (
        ws_id, group_id, student_user_id, absence_date, attendance_id,
        state, reminded_at
      )
      values (
        p_ws_id, p_group_id, p_student_user_id, p_absence_date,
        p_attendance_id, 'reminded', v_now
      )
      on conflict on constraint tutoring_absence_followups_absence_key
        do nothing
      returning * into v_row;
      v_event := 'reminded';
    elsif p_action = 'archive' and p_actor_user_id is not null then
      insert into private.tutoring_absence_followups (
        ws_id, group_id, student_user_id, absence_date, attendance_id,
        state, archived_at, archived_by, archive_reason
      )
      values (
        p_ws_id, p_group_id, p_student_user_id, p_absence_date,
        p_attendance_id, 'archived', v_now, p_actor_user_id, 'manual'
      )
      on conflict on constraint tutoring_absence_followups_absence_key
        do nothing
      returning * into v_row;
      v_event := 'manually_archived';
    else
      -- The system never archives an absence it has not reminded about, and
      -- there is nothing to restore.
      return pg_catalog.jsonb_build_object(
        'followup_id', null, 'state', null, 'changed', false,
        'skipped', 'not_found'
      );
    end if;

    if v_row.id is null then
      -- A concurrent writer created it first; report its state unchanged.
      select * into v_row
      from private.tutoring_absence_followups f
      where f.group_id = p_group_id
        and f.student_user_id = p_student_user_id
        and f.absence_date = p_absence_date;
      v_event := null;
    end if;
  elsif p_action = 'archive'
        and (v_row.state = 'reminded'
             or (v_row.state = 'restored' and p_actor_user_id is not null)) then
    update private.tutoring_absence_followups f
    set state = 'archived',
        archived_at = v_now,
        archived_by = p_actor_user_id,
        archive_reason = case
          when p_actor_user_id is null then 'no_makeup_after_reminder'
          else 'manual'
        end
    where f.id = v_row.id
    returning * into v_row;
    v_event := case
      when p_actor_user_id is null then 'archived'
      else 'manually_archived'
    end;
  elsif p_action = 'restore' and v_row.state = 'archived' then
    update private.tutoring_absence_followups f
    set state = 'restored',
        restored_at = v_now,
        restored_by = p_actor_user_id
    where f.id = v_row.id
    returning * into v_row;
    v_event := 'restored';
  end if;

  if v_event is not null then
    insert into private.tutoring_automation_events (
      ws_id, subject_kind, subject_id, action, actor_user_id, run_slot, detail
    )
    values (
      p_ws_id, 'absence_followup', v_row.id, v_event, p_actor_user_id,
      p_run_slot,
      pg_catalog.jsonb_build_object(
        'group_id', p_group_id,
        'student_user_id', p_student_user_id,
        'absence_date', p_absence_date
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'followup_id', v_row.id,
    'state', v_row.state,
    'changed', v_event is not null,
    'skipped', null
  );
end;
$$;

comment on function private.tutoring_absence_followup_apply(
  uuid, uuid, uuid, date, text, uuid, text, uuid
) is
  'Service role only. Applies remind (system), archive (system after a reminder, or staff), or restore (staff) to one absence follow-up and audits it in the same transaction.';

revoke all on function private.tutoring_automation_settings_track()
  from public, anon, authenticated;
revoke all on function private.tutoring_absence_followups_guard()
  from public, anon, authenticated;
revoke all on function private.tutoring_automation_events_append_only()
  from public, anon, authenticated;
revoke all on function private.tutoring_absence_followup_apply(
  uuid, uuid, uuid, date, text, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function private.tutoring_absence_followup_apply(
  uuid, uuid, uuid, date, text, uuid, text, uuid
) to service_role;

-- 5. Notification types ----------------------------------------------------------

do $$
declare
  current_comment text;
  current_types text[];
  added_types text[] := array[
    'tutoring_absence_makeup_reminder',
    'tutoring_lesson_incomplete_report'
  ];
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

  select array_agg(type_name order by position)
    into added_types
  from unnest(added_types) with ordinality as types(type_name, position)
  where not type_name = any(current_types);

  if added_types is null then
    return;
  end if;

  select obj_description(constraint_row.oid, 'pg_constraint')
    into current_comment
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.notifications'::regclass
    and constraint_row.conname = 'notifications_type_check';

  alter table public.notifications
    drop constraint notifications_type_check;

  -- NOT VALID: the list is a strict superset, so existing rows already pass,
  -- and no validation scan runs while ACCESS EXCLUSIVE is held.
  execute format(
    'alter table public.notifications add constraint notifications_type_check check (type in (%s)) not valid',
    (
      select string_agg(quote_literal(type_name), ', ' order by position)
      from unnest(current_types || added_types) with ordinality as types(type_name, position)
    )
  );

  execute format(
    'comment on constraint notifications_type_check on public.notifications is %L',
    coalesce(current_comment, 'Validates notification types.')
  );
end;
$$;

-- 6. Receipt kinds ---------------------------------------------------------------

alter table private.tutoring_notification_receipts
  add column ws_id uuid references public.workspaces(id) on delete cascade,
  add column absence_followup_id uuid
    references private.tutoring_absence_followups(id) on delete cascade,
  add column report_date date;

alter table private.tutoring_notification_receipts
  drop constraint tutoring_notification_receipts_kind_check;

-- No caller writes receipts yet, so validating the replacement scans no rows.
alter table private.tutoring_notification_receipts
  add constraint tutoring_notification_receipts_kind_check check (
    (
      kind = 'weak_content_review_due'
      and group_id is not null
      and student_user_id is not null
      and review_cycle_started_at is not null
      and tutoring_session_id is null
      and absence_followup_id is null
      and report_date is null
    )
    or (
      kind = 'session_completed'
      and tutoring_session_id is not null
      and group_id is null
      and student_user_id is null
      and review_cycle_started_at is null
      and absence_followup_id is null
      and report_date is null
    )
    or (
      kind = 'absence_reminder'
      and ws_id is not null
      and absence_followup_id is not null
      and group_id is null
      and student_user_id is null
      and review_cycle_started_at is null
      and tutoring_session_id is null
      and report_date is null
    )
    or (
      kind = 'lesson_report'
      and ws_id is not null
      and report_date is not null
      and group_id is null
      and student_user_id is null
      and review_cycle_started_at is null
      and tutoring_session_id is null
      and absence_followup_id is null
    )
  );

-- As with the existing keys, null columns of other kinds never collide.
alter table private.tutoring_notification_receipts
  add constraint tutoring_notification_receipts_absence_key unique (
    absence_followup_id, recipient_user_id
  ),
  add constraint tutoring_notification_receipts_report_key unique (
    ws_id, report_date, recipient_user_id
  );

-- 7. Access ---------------------------------------------------------------------

alter table private.tutoring_automation_settings enable row level security;
alter table private.tutoring_absence_followups enable row level security;
alter table private.tutoring_automation_events enable row level security;

revoke all on table private.tutoring_automation_settings
  from public, anon, authenticated, service_role;
revoke all on table private.tutoring_absence_followups
  from public, anon, authenticated, service_role;
revoke all on table private.tutoring_automation_events
  from public, anon, authenticated, service_role;

grant select, insert, update on table private.tutoring_automation_settings
  to service_role;
-- No delete: archive is a state, never a hard delete.
grant select, insert, update on table private.tutoring_absence_followups
  to service_role;
-- Append-only.
grant select, insert on table private.tutoring_automation_events
  to service_role;

notify pgrst, 'reload schema';
