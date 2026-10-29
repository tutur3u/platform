-- Hardening for the tutoring automation foundation: enablement stamps, the
-- settings audit, the follow-up guard, attendance scoping, and the staff fence.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

create function pg_temp.fid(n integer) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

-- 98101 creator (MEMBER, every permission), 98102 GUEST, 98103 MEMBER
-- without update_user_groups_scores.
insert into auth.users(id)
values (pg_temp.fid(98101)), (pg_temp.fid(98102)), (pg_temp.fid(98103));
insert into public.users(id)
values (pg_temp.fid(98101)), (pg_temp.fid(98102)), (pg_temp.fid(98103))
on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id)
values
  (pg_temp.fid(98111), 'Synthetic hardening', false, pg_temp.fid(98101)),
  (pg_temp.fid(98112), 'Synthetic other tenant', false, pg_temp.fid(98101));
insert into public.workspace_members(ws_id, user_id, type)
values
  (pg_temp.fid(98111), pg_temp.fid(98101), 'MEMBER'),
  (pg_temp.fid(98111), pg_temp.fid(98102), 'GUEST'),
  (pg_temp.fid(98111), pg_temp.fid(98103), 'MEMBER')
on conflict do nothing;
delete from public.workspace_default_permissions where ws_id = pg_temp.fid(98111);
insert into public.workspace_users(id, ws_id, full_name)
values
  (pg_temp.fid(98121), pg_temp.fid(98111), 'Synthetic learner'),
  (pg_temp.fid(98122), pg_temp.fid(98112), 'Synthetic other learner');
insert into public.workspace_user_groups(id, ws_id, name)
values
  (pg_temp.fid(98131), pg_temp.fid(98111), 'Synthetic class'),
  (pg_temp.fid(98132), pg_temp.fid(98112), 'Synthetic other class');
insert into public.user_group_attendance(id, group_id, user_id, date, status)
values
  (pg_temp.fid(98141), pg_temp.fid(98131), pg_temp.fid(98121), date '2026-10-01', 'ABSENT'),
  (pg_temp.fid(98142), pg_temp.fid(98132), pg_temp.fid(98122), date '2026-10-02', 'ABSENT');

create function pg_temp.apply(
  p_action text, p_date date, p_actor uuid default null, p_attendance uuid default null
) returns jsonb language sql as $$
  select private.tutoring_absence_followup_apply(
    pg_temp.fid(98111), pg_temp.fid(98131), pg_temp.fid(98121), p_date,
    p_action, p_actor, 'synthetic-slot', p_attendance
  );
$$;

create function pg_temp.settings_events() returns integer language sql as $$
  select count(*)::integer from private.tutoring_automation_events
  where subject_kind = 'settings' and subject_id = pg_temp.fid(98111);
$$;

-- M1: enablement stamps ------------------------------------------------------------

insert into private.tutoring_automation_settings(ws_id, absence_followup_enabled_at, updated_by)
values (pg_temp.fid(98111), timestamptz '2000-01-01 00:00+07', pg_temp.fid(98103));
select is(
  (select absence_followup_enabled_at from private.tutoring_automation_settings
   where ws_id = pg_temp.fid(98111)),
  null,
  'an insert cannot preset the stamp of a rule that is off'
);
select is(
  (select updated_by from private.tutoring_automation_settings
   where ws_id = pg_temp.fid(98111)),
  null,
  'a client-supplied updated_by is ignored; no session actor means the system'
);

select set_config('tutoring_automation.actor_user_id', pg_temp.fid(98101)::text, true);
update private.tutoring_automation_settings
set absence_followup_enabled = true
where ws_id = pg_temp.fid(98111);
select set_config('tutoring_automation.actor_user_id', '', true);
select is(
  (select absence_followup_enabled_at from private.tutoring_automation_settings
   where ws_id = pg_temp.fid(98111)),
  now(),
  'switching the rule on stamps now()'
);
update private.tutoring_automation_settings
set absence_followup_enabled = false
where ws_id = pg_temp.fid(98111);
update private.tutoring_automation_settings
set absence_followup_enabled = true, absence_followup_enabled_at = timestamptz '2000-01-01 00:00+07'
where ws_id = pg_temp.fid(98111);
select is(
  (select absence_followup_enabled_at from private.tutoring_automation_settings
   where ws_id = pg_temp.fid(98111)),
  now(),
  'switching back on stamps now(), never a supplied value'
);

-- L1: settings audit -----------------------------------------------------------------

select is(pg_temp.settings_events(), 4, 'insert and three effective updates: four events');
select is(
  (select array_agg(actor_user_id::text order by actor_user_id nulls first)
   from private.tutoring_automation_events
   where subject_kind = 'settings' and subject_id = pg_temp.fid(98111)),
  array[null, null, null, pg_temp.fid(98101)::text],
  'only the write made with a session actor is attributed; others are the system'
);
update private.tutoring_automation_settings
set reminder_after_days = reminder_after_days
where ws_id = pg_temp.fid(98111);
select is(pg_temp.settings_events(), 4, 'a no-op update writes no event');
insert into private.tutoring_automation_settings(ws_id, reminder_after_days)
values (pg_temp.fid(98111), 9)
on conflict (ws_id) do nothing;
select is(pg_temp.settings_events(), 4, 'an upsert that does nothing writes no event');
insert into private.tutoring_automation_settings(ws_id, reminder_after_days)
values (pg_temp.fid(98111), 5)
on conflict (ws_id) do update set archive_after_days = 7;
select is(pg_temp.settings_events(), 5, 'an upsert that updates writes exactly one event');
select is(
  (select array[(detail->>'reminder_after_days')::integer, (detail->>'archive_after_days')::integer]
   from private.tutoring_automation_events
   where subject_kind = 'settings' and subject_id = pg_temp.fid(98111)
     and (detail->>'archive_after_days')::integer = 7),
  array[3, 7],
  'the upsert event records the applied values, not the proposed insert'
);

-- L4: staff fence --------------------------------------------------------------------

select throws_ok(
  $q$select pg_temp.apply('archive', date '2026-10-01', '00000000-0000-4000-8000-000000098102')$q$,
  '42501', null,
  'a guest cannot archive'
);
select is(
  public.has_workspace_permission(pg_temp.fid(98111), pg_temp.fid(98103), 'update_user_groups_scores'),
  false,
  'fixture: 98103 lacks the tutoring permission'
);
select throws_ok(
  $q$select pg_temp.apply('archive', date '2026-10-01', '00000000-0000-4000-8000-000000098103')$q$,
  '42501', null,
  'a member without update_user_groups_scores cannot archive'
);

-- L3: attendance scoping -------------------------------------------------------------

select throws_ok(
  $q$select pg_temp.apply('remind', date '2026-10-02', null, '00000000-0000-4000-8000-000000098142')$q$,
  '23514', null,
  'another tenant''s attendance cannot be linked'
);
select throws_ok(
  $q$select pg_temp.apply('remind', date '2026-10-02', null, '00000000-0000-4000-8000-000000098141')$q$,
  '23514', null,
  'attendance from another date cannot be linked'
);
select is(
  pg_temp.apply('remind', date '2026-10-01', null, pg_temp.fid(98141))->>'state',
  'reminded',
  'the matching attendance row links'
);
select throws_ok(
  $q$update private.tutoring_absence_followups
     set attendance_id = '00000000-0000-4000-8000-000000098142'
     where absence_date = date '2026-10-01'
       and student_user_id = '00000000-0000-4000-8000-000000098121'$q$,
  '23514', null,
  'a link cannot be repointed at another tenant''s attendance'
);

-- L2: the guard ----------------------------------------------------------------------

select is(
  pg_temp.apply('archive', date '2026-10-01', pg_temp.fid(98101))->>'state',
  'archived',
  'fixture: staff archive the reminded absence'
);
select throws_ok(
  $q$update private.tutoring_absence_followups set archived_by = null
     where absence_date = date '2026-10-01'
       and student_user_id = '00000000-0000-4000-8000-000000098121'$q$,
  '23514', null,
  'an archived row cannot rewrite who archived it'
);
select throws_ok(
  $q$update private.tutoring_absence_followups
     set archive_reason = 'no_makeup_after_reminder', archived_by = null
     where absence_date = date '2026-10-01'
       and student_user_id = '00000000-0000-4000-8000-000000098121'$q$,
  '23514', null,
  'an archived row cannot rewrite its reason'
);
select throws_ok(
  $q$update private.tutoring_absence_followups set id = gen_random_uuid()
     where absence_date = date '2026-10-01'
       and student_user_id = '00000000-0000-4000-8000-000000098121'$q$,
  '23514', null,
  'the follow-up id is immutable'
);
select throws_ok(
  $q$update private.tutoring_absence_followups set state = 'restored', restored_at = now()
     where absence_date = date '2026-10-01'
       and student_user_id = '00000000-0000-4000-8000-000000098121'$q$,
  '23514', null,
  'a restore must name who restored it'
);
select is(
  (select revision from private.tutoring_absence_followups
   where absence_date = date '2026-10-01' and student_user_id = pg_temp.fid(98121)),
  1,
  'rejected writes leave the revision untouched'
);

insert into private.tutoring_absence_followups(
  ws_id, group_id, student_user_id, absence_date, state, reminded_at,
  revision, created_at, updated_at
)
values (
  pg_temp.fid(98111), pg_temp.fid(98131), pg_temp.fid(98121), date '2026-10-03',
  'reminded', now(), 999, timestamptz '1990-01-01', timestamptz '1990-01-01'
);
select ok(
  (select revision = 0 and created_at = now() and updated_at = now()
   from private.tutoring_absence_followups
   where absence_date = date '2026-10-03' and student_user_id = pg_temp.fid(98121)),
  'an insert cannot forge its revision or timestamps'
);
select throws_ok(
  $q$insert into private.tutoring_absence_followups(
       ws_id, group_id, student_user_id, absence_date, state, reminded_at,
       archived_at, archived_by, archive_reason)
     values ('00000000-0000-4000-8000-000000098111', '00000000-0000-4000-8000-000000098131',
       '00000000-0000-4000-8000-000000098121', date '2026-10-04', 'archived',
       timestamptz '2026-10-01', now(), '00000000-0000-4000-8000-000000098101', 'manual')$q$,
  '23514', null,
  'an insert cannot fabricate a reminder on an archived row'
);
select throws_ok(
  $q$insert into private.tutoring_absence_followups(
       ws_id, group_id, student_user_id, absence_date, state, archived_at, archive_reason)
     values ('00000000-0000-4000-8000-000000098111', '00000000-0000-4000-8000-000000098131',
       '00000000-0000-4000-8000-000000098121', date '2026-10-04', 'archived', now(), 'manual')$q$,
  '23514', null,
  'a manual archive insert must name the staff actor'
);
select throws_ok(
  $q$insert into private.tutoring_absence_followups(
       ws_id, group_id, student_user_id, absence_date, state, reminded_at, archived_by)
     values ('00000000-0000-4000-8000-000000098111', '00000000-0000-4000-8000-000000098131',
       '00000000-0000-4000-8000-000000098121', date '2026-10-04', 'reminded', now(),
       '00000000-0000-4000-8000-000000098101')$q$,
  '23514', null,
  'a reminded insert cannot carry archive fields'
);
select throws_ok(
  $q$update private.tutoring_absence_followups set reminded_at = null, state = 'archived',
       archived_at = now(), archived_by = '00000000-0000-4000-8000-000000098101',
       archive_reason = 'manual'
     where absence_date = date '2026-10-03'
       and student_user_id = '00000000-0000-4000-8000-000000098121'$q$,
  '23514', null,
  'the reminder time cannot be cleared'
);
select is(
  pg_temp.apply('archive', date '2026-10-03')->>'state',
  'archived',
  'the scheduled job still archives a reminded row'
);
select is(
  (select coalesce(archived_by::text, 'system') || ':' || archive_reason
   from private.tutoring_absence_followups
   where absence_date = date '2026-10-03' and student_user_id = pg_temp.fid(98121)),
  'system:no_makeup_after_reminder',
  'the automatic archive keeps the system actor and reason'
);

-- I2: audit truncate fence -----------------------------------------------------------

select throws_ok(
  'truncate private.tutoring_automation_events',
  '42501', null,
  'even the owner cannot truncate the audit'
);

select * from finish();
rollback;
