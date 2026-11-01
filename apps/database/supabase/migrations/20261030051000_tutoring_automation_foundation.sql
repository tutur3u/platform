BEGIN;

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
--
-- The notification types and receipt kinds are in
-- 20261030051010_tutoring_automation_notifications.sql.
--
-- All tables are service-role only, with RLS enabled and no client policies.
-- private.tutoring_absence_followup_apply is the only writer of follow-up
-- state that also records the audit event; a trigger enforces the state
-- machine for any other writer. Callers derive the staff actor from the
-- authenticated session; null is reserved for the scheduled job.
--
-- The four trigger functions are revoked from every client role and are never
-- granted: only the trigger machinery runs them. The apply function is the one
-- service_role grant.
-- tuturuuu: no-grant (trigger)
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
  -- Actor columns have no foreign key, like the audit: deleting an account
  -- must not rewrite follow-up history, which the guard forbids.
  archived_by uuid,
  archive_reason text
    constraint tutoring_absence_followups_archive_reason_check
      check (archive_reason in ('no_makeup_after_reminder', 'manual')),
  restored_at timestamptz,
  restored_by uuid,
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
  'Follow-up state of one unrecovered absence: reminded once, then archived from the support queue, and restorable. The application never hard-deletes it; only deleting the workspace, class or learner cascades.';
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

-- The actor of a settings write is the transaction-local
-- tutoring_automation.actor_user_id setting, which the settings writer sets
-- from the authenticated session. A write without it is attributed to the
-- system (null); a client-supplied updated_by is ignored.
create function private.tutoring_automation_settings_stamp()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_by := nullif(
    pg_catalog.current_setting('tutoring_automation.actor_user_id', true), ''
  )::uuid;
  new.updated_at := pg_catalog.now();
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.now();
    new.absence_followup_enabled_at := case
      when new.absence_followup_enabled then pg_catalog.now()
    end;
    new.lesson_report_enabled_at := case
      when new.lesson_report_enabled then pg_catalog.now()
    end;
  else
    if new.ws_id is distinct from old.ws_id then
      raise exception 'Settings workspace is immutable' using errcode = '23514';
    end if;
    new.created_at := old.created_at;
    -- A stamp changes only when its rule switches on, so it can never be
    -- backdated to pull historical absences into a running rule.
    new.absence_followup_enabled_at := case
      when new.absence_followup_enabled and not old.absence_followup_enabled
        then pg_catalog.now()
      else old.absence_followup_enabled_at
    end;
    new.lesson_report_enabled_at := case
      when new.lesson_report_enabled and not old.lesson_report_enabled
        then pg_catalog.now()
      else old.lesson_report_enabled_at
    end;
  end if;
  return new;
end;
$$;

create trigger tutoring_automation_settings_stamp
  before insert or update on private.tutoring_automation_settings
  for each row
  execute function private.tutoring_automation_settings_stamp();

-- Audits applied settings once per effective change. AFTER triggers do not
-- fire for ON CONFLICT DO NOTHING, and an upsert that updates fires only the
-- UPDATE, so neither writes a phantom or duplicate event.
create function private.tutoring_automation_settings_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (
    new.absence_followup_enabled, new.absence_followup_enabled_at,
    new.reminder_after_days, new.archive_after_days,
    new.lesson_report_enabled, new.lesson_report_enabled_at,
    new.consecutive_sessions
  ) is not distinct from (
    old.absence_followup_enabled, old.absence_followup_enabled_at,
    old.reminder_after_days, old.archive_after_days,
    old.lesson_report_enabled, old.lesson_report_enabled_at,
    old.consecutive_sessions
  ) then
    return null;
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
  return null;
end;
$$;

create trigger tutoring_automation_settings_audit
  after insert or update on private.tutoring_automation_settings
  for each row
  execute function private.tutoring_automation_settings_audit();

-- Enforces the follow-up state machine for every writer: identity and history
-- are immutable, each transition may set only its own fields, transition
-- times are the database's now() (a caller may only omit them or pass now()),
-- inserts cannot forge history, and an attendance link must be the same
-- absence.
create function private.tutoring_absence_followups_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 0;
    new.created_at := pg_catalog.now();
    new.updated_at := new.created_at;
    if (new.reminded_at is not null and new.reminded_at <> pg_catalog.now())
       or (new.archived_at is not null and new.archived_at <> pg_catalog.now()) then
      raise exception 'Follow-up transition times are set by the database'
        using errcode = '23514';
    end if;
    if new.state = 'reminded' then
      new.reminded_at := pg_catalog.now();
    elsif new.state = 'archived' then
      new.archived_at := pg_catalog.now();
    end if;
    if new.restored_at is not null or new.restored_by is not null or not (
      (new.state = 'reminded'
        and new.reminded_at is not null
        and new.archived_at is null
        and new.archived_by is null
        and new.archive_reason is null)
      -- Only staff archive without a reminder; the system archives a
      -- reminded row through an update.
      or (new.state = 'archived'
        and new.reminded_at is null
        and new.archived_at is not null
        and new.archive_reason = 'manual'
        and new.archived_by is not null)
    ) then
      raise exception 'A follow-up starts reminded, or archived by staff'
        using errcode = '23514';
    end if;
  else
    if new.id is distinct from old.id
       or new.ws_id is distinct from old.ws_id
       or new.group_id is distinct from old.group_id
       or new.student_user_id is distinct from old.student_user_id
       or new.absence_date is distinct from old.absence_date
       or new.created_at is distinct from old.created_at then
      raise exception 'Follow-up identity is immutable' using errcode = '23514';
    end if;
    -- One reminder per absence, ever, and only when the row is created.
    if new.reminded_at is distinct from old.reminded_at then
      raise exception 'A follow-up is reminded at most once'
        using errcode = '23514';
    end if;
    -- A transition stamps its own time; a caller may leave it unchanged or
    -- pass now(), never another value.
    if new.state = 'archived' and old.state <> 'archived' then
      if new.archived_at is distinct from old.archived_at
         and new.archived_at is distinct from pg_catalog.now() then
        raise exception 'Follow-up transition times are set by the database'
          using errcode = '23514';
      end if;
      new.archived_at := pg_catalog.now();
    elsif new.state = 'restored' and old.state = 'archived' then
      if new.restored_at is distinct from old.restored_at
         and new.restored_at is distinct from pg_catalog.now() then
        raise exception 'Follow-up transition times are set by the database'
          using errcode = '23514';
      end if;
      new.restored_at := pg_catalog.now();
    end if;
    if not (
      (new.state = old.state
        and (new.archived_at, new.archived_by, new.archive_reason,
             new.restored_at, new.restored_by)
          is not distinct from
            (old.archived_at, old.archived_by, old.archive_reason,
             old.restored_at, old.restored_by))
      or (old.state = 'reminded' and new.state = 'archived'
        and (new.restored_at, new.restored_by)
          is not distinct from (old.restored_at, old.restored_by)
        and ((new.archive_reason = 'no_makeup_after_reminder'
              and new.archived_by is null)
          or (new.archive_reason = 'manual' and new.archived_by is not null)))
      or (old.state = 'archived' and new.state = 'restored'
        and (new.archived_at, new.archived_by, new.archive_reason)
          is not distinct from
            (old.archived_at, old.archived_by, old.archive_reason)
        and new.restored_at is not null
        and new.restored_by is not null)
      or (old.state = 'restored' and new.state = 'archived'
        and (new.restored_at, new.restored_by)
          is not distinct from (old.restored_at, old.restored_by)
        and new.archive_reason = 'manual'
        and new.archived_by is not null)
    ) then
      raise exception 'Follow-up cannot move from % to % with these fields',
        old.state, new.state
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

  if new.attendance_id is not null
     and (tg_op = 'INSERT' or new.attendance_id is distinct from old.attendance_id)
     and not exists (
       select 1 from public.user_group_attendance a
       where a.id = new.attendance_id
         and a.group_id = new.group_id
         and a.user_id = new.student_user_id
         and a.date = new.absence_date
     ) then
    raise exception 'Attendance must be this class, learner and date'
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

-- Row DELETE stays privilege-only so deleting a workspace still cascades.
create trigger tutoring_automation_events_no_truncate
  before truncate on private.tutoring_automation_events
  for each statement
  execute function private.tutoring_automation_events_append_only();

-- Applies one follow-up action and records its audit event atomically.
-- p_actor_user_id null means the scheduled system actor, which is fenced by
-- the workspace setting. A staff actor must be a MEMBER (not a guest) holding
-- update_user_groups_scores. Callers must take the actor from the
-- authenticated session and never pass null for a user request.
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
      where m.ws_id = p_ws_id
        and m.user_id = p_actor_user_id
        and m.type = 'MEMBER'
    ) or public.has_workspace_permission(
      p_ws_id, p_actor_user_id, 'update_user_groups_scores'
    ) is not true then
      raise exception 'Actor cannot manage tutoring follow-ups'
        using errcode = '42501';
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

revoke all on function private.tutoring_automation_settings_stamp()
  from public, anon, authenticated;
revoke all on function private.tutoring_automation_settings_audit()
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

-- 5. Access ---------------------------------------------------------------------

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

COMMIT;
