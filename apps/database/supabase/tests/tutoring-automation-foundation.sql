begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(59);

create function pg_temp.fid(n integer) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

-- 98001 is a workspace member (staff), 98002 has an account but no membership.
insert into auth.users(id) values (pg_temp.fid(98001)), (pg_temp.fid(98002));
insert into public.users(id)
values (pg_temp.fid(98001)), (pg_temp.fid(98002))
on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id)
values
  (pg_temp.fid(98011), 'Synthetic tutoring automation', false, pg_temp.fid(98001)),
  (pg_temp.fid(98012), 'Synthetic other workspace', false, pg_temp.fid(98001));
insert into public.workspace_members(ws_id, user_id, type)
values (pg_temp.fid(98011), pg_temp.fid(98001), 'MEMBER')
on conflict do nothing;
insert into public.user_private_details(user_id, email)
values (pg_temp.fid(98001), 'synthetic-office@example.invalid')
on conflict (user_id) do update set email = excluded.email;
insert into public.workspace_users(id, ws_id, full_name)
values
  (pg_temp.fid(98021), pg_temp.fid(98011), 'Synthetic learner'),
  (pg_temp.fid(98022), pg_temp.fid(98012), 'Synthetic other learner');
insert into public.workspace_user_groups(id, ws_id, name)
values
  (pg_temp.fid(98031), pg_temp.fid(98011), 'Synthetic class'),
  (pg_temp.fid(98032), pg_temp.fid(98012), 'Synthetic other class');

create function pg_temp.apply(
  p_action text,
  p_date date,
  p_actor uuid default null
) returns jsonb language sql as $$
  select private.tutoring_absence_followup_apply(
    pg_temp.fid(98011), pg_temp.fid(98031), pg_temp.fid(98021), p_date,
    p_action, p_actor, 'synthetic-slot'
  );
$$;

-- Tables, deny-by-default access ---------------------------------------------

select has_table('private', 'tutoring_automation_settings', 'settings table exists');
select has_table('private', 'tutoring_absence_followups', 'follow-up table exists');
select has_table('private', 'tutoring_automation_events', 'audit table exists');

select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in (
     'private.tutoring_automation_settings'::regclass,
     'private.tutoring_absence_followups'::regclass,
     'private.tutoring_automation_events'::regclass
   )),
  'all three tables have row level security enabled'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'private'
     and tablename in (
       'tutoring_automation_settings',
       'tutoring_absence_followups',
       'tutoring_automation_events'
     )),
  0,
  'no client RLS policies exist'
);
select ok(
  not exists (
    select 1
    from unnest(array['public', 'anon', 'authenticated']) as roles(role_name)
    cross join unnest(array[
      'private.tutoring_automation_settings',
      'private.tutoring_absence_followups',
      'private.tutoring_automation_events'
    ]) as tables(table_name)
    cross join unnest(array[
      'select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'
    ]) as privileges(privilege_name)
    where has_table_privilege(role_name, table_name, privilege_name)
  ),
  'public, anon, and authenticated hold no table privileges'
);
select ok(
  has_table_privilege('service_role', 'private.tutoring_automation_settings', 'select,insert,update')
  and has_table_privilege('service_role', 'private.tutoring_absence_followups', 'select,insert,update')
  and has_table_privilege('service_role', 'private.tutoring_automation_events', 'select,insert'),
  'service_role can read and write through the intended paths'
);
select ok(
  not exists (
    select 1
    from (values
      ('private.tutoring_automation_settings', 'delete'),
      ('private.tutoring_automation_settings', 'truncate'),
      ('private.tutoring_absence_followups', 'delete'),
      ('private.tutoring_absence_followups', 'truncate'),
      ('private.tutoring_automation_events', 'update'),
      ('private.tutoring_automation_events', 'delete'),
      ('private.tutoring_automation_events', 'truncate')
    ) as denied(table_name, privilege_name)
    where has_table_privilege('service_role', table_name, privilege_name)
  ),
  'service_role cannot hard-delete follow-ups or rewrite the audit'
);
select ok(
  not exists (
    select 1
    from unnest(array['public', 'anon', 'authenticated']) as roles(role_name)
    cross join unnest(array[
      'private.tutoring_absence_followup_apply(uuid,uuid,uuid,date,text,uuid,text,uuid)',
      'private.tutoring_automation_settings_stamp()',
      'private.tutoring_automation_settings_audit()',
      'private.tutoring_absence_followups_guard()',
      'private.tutoring_automation_events_append_only()'
    ]) as functions(function_name)
    where has_function_privilege(role_name, function_name, 'execute')
  ),
  'no client role can execute the new functions'
);
select ok(
  has_function_privilege(
    'service_role',
    'private.tutoring_absence_followup_apply(uuid,uuid,uuid,date,text,uuid,text,uuid)',
    'execute'
  ),
  'service_role can execute the follow-up action'
);
select is(
  (select count(*)::integer from pg_proc
   where pronamespace = 'private'::regnamespace
     and proname in (
       'tutoring_absence_followup_apply',
       'tutoring_automation_settings_stamp',
       'tutoring_automation_settings_audit',
       'tutoring_absence_followups_guard',
       'tutoring_automation_events_append_only'
     )
     and prosecdef
     and proconfig = array['search_path=pg_catalog, pg_temp']),
  5,
  'every new function is SECURITY DEFINER with search_path pg_catalog, pg_temp'
);

set local role authenticated;
select throws_ok(
  'select * from private.tutoring_automation_settings',
  '42501', null,
  'authenticated cannot read settings'
);
select throws_ok(
  $q$select private.tutoring_absence_followup_apply(
       '00000000-0000-4000-8000-000000098011', '00000000-0000-4000-8000-000000098031',
       '00000000-0000-4000-8000-000000098021', date '2026-10-01', 'archive',
       '00000000-0000-4000-8000-000000098001')$q$,
  '42501', null,
  'authenticated cannot apply follow-up actions'
);
reset role;

-- Settings default off ---------------------------------------------------------

insert into private.tutoring_automation_settings(ws_id) values (pg_temp.fid(98011));

select ok(
  (select not absence_followup_enabled and not lesson_report_enabled
     and absence_followup_enabled_at is null and lesson_report_enabled_at is null
   from private.tutoring_automation_settings where ws_id = pg_temp.fid(98011)),
  'a new settings row has every rule off'
);
select is(
  (select array[reminder_after_days, archive_after_days, consecutive_sessions]::integer[]
   from private.tutoring_automation_settings where ws_id = pg_temp.fid(98011)),
  array[3, 3, 2],
  'defaults: remind after 3 days, archive 3 days later, 2 consecutive sessions'
);
select is(
  (select count(*)::integer from private.tutoring_automation_events
   where subject_kind = 'settings' and subject_id = pg_temp.fid(98011)
     and action = 'settings_changed'),
  1,
  'creating settings is audited'
);
select throws_ok(
  $q$update private.tutoring_automation_settings set reminder_after_days = 0
     where ws_id = '00000000-0000-4000-8000-000000098011'$q$,
  '23514', null,
  'reminder delay must be at least one day'
);

-- The system actor is fenced by the setting.
select is(
  pg_temp.apply('remind', date '2026-10-01')->>'skipped',
  'disabled',
  'the scheduled job does nothing while the workspace setting is off'
);
select is(
  (select count(*)::integer from private.tutoring_absence_followups
   where ws_id = pg_temp.fid(98011)),
  0,
  'no follow-up is written while disabled'
);

-- The settings writer sets the actor from the session, transaction-local.
select set_config('tutoring_automation.actor_user_id', pg_temp.fid(98001)::text, true);
update private.tutoring_automation_settings
set absence_followup_enabled = true
where ws_id = pg_temp.fid(98011);
select set_config('tutoring_automation.actor_user_id', '', true);

select isnt(
  (select absence_followup_enabled_at from private.tutoring_automation_settings
   where ws_id = pg_temp.fid(98011)),
  null,
  'enabling stamps absence_followup_enabled_at'
);
select is(
  (select actor_user_id from private.tutoring_automation_events
   where subject_kind = 'settings' and subject_id = pg_temp.fid(98011)
     and (detail->>'absence_followup_enabled')::boolean),
  pg_temp.fid(98001),
  'enabling is audited with the staff actor'
);
create temporary table enabled_stamp on commit drop as
select absence_followup_enabled_at as stamp
from private.tutoring_automation_settings where ws_id = pg_temp.fid(98011);
update private.tutoring_automation_settings
set absence_followup_enabled_at = timestamptz '2000-01-01 00:00+07'
where ws_id = pg_temp.fid(98011);
select is(
  (select absence_followup_enabled_at from private.tutoring_automation_settings
   where ws_id = pg_temp.fid(98011)),
  (select stamp from enabled_stamp),
  'the enablement time cannot be backdated while the rule stays on'
);

-- State machine: remind once, archive, restore, hold --------------------------

select is(
  pg_temp.apply('remind', date '2026-10-01')->>'state',
  'reminded',
  'the scheduled job reminds an unrecovered absence'
);
select is(
  (pg_temp.apply('remind', date '2026-10-01')->>'changed')::boolean,
  false,
  'a second reminder for the same absence is a no-op'
);
select throws_ok(
  $q$select pg_temp.apply('remind', date '2026-10-01', '00000000-0000-4000-8000-000000098001')$q$,
  '42501', null,
  'staff cannot send reminders through the job path'
);
select throws_ok(
  $q$select pg_temp.apply('restore', date '2026-10-01')$q$,
  '42501', null,
  'the scheduled job cannot restore'
);

select is(
  pg_temp.apply('archive', date '2026-10-01')->>'state',
  'archived',
  'the scheduled job archives a reminded absence'
);
select is(
  (select archive_reason || ':' || coalesce(archived_by::text, 'system')
   from private.tutoring_absence_followups
   where student_user_id = pg_temp.fid(98021) and absence_date = date '2026-10-01'),
  'no_makeup_after_reminder:system',
  'automatic archive records its reason and the system actor'
);
select throws_ok(
  $q$select pg_temp.apply('restore', date '2026-10-01', '00000000-0000-4000-8000-000000098002')$q$,
  '42501', null,
  'a non-member cannot restore'
);
select is(
  pg_temp.apply('restore', date '2026-10-01', pg_temp.fid(98001))->>'state',
  'restored',
  'staff restore an archived absence'
);
select is(
  (select restored_by from private.tutoring_absence_followups
   where student_user_id = pg_temp.fid(98021) and absence_date = date '2026-10-01'),
  pg_temp.fid(98001),
  'restore records the staff actor'
);
select is(
  pg_temp.apply('archive', date '2026-10-01')->>'state',
  'restored',
  'a restored absence is held: the scheduled job cannot archive it again'
);
select is(
  pg_temp.apply('archive', date '2026-10-01', pg_temp.fid(98001))->>'state',
  'archived',
  'staff can archive a restored absence again'
);
select is(
  (select revision from private.tutoring_absence_followups
   where student_user_id = pg_temp.fid(98021) and absence_date = date '2026-10-01'),
  3,
  'each transition bumps the revision'
);
select is(
  (select array_agg(action order by created_at, action)
   from private.tutoring_automation_events
   where subject_kind = 'absence_followup'
     and subject_id = (
       select id from private.tutoring_absence_followups
       where student_user_id = pg_temp.fid(98021)
         and absence_date = date '2026-10-01'
     )),
  array['archived', 'manually_archived', 'reminded', 'restored'],
  'every effective transition is audited once; no-ops are not'
);

select is(
  pg_temp.apply('archive', date '2026-10-02')->>'skipped',
  'not_found',
  'the scheduled job never archives an absence it did not remind about'
);
select is(
  pg_temp.apply('archive', date '2026-10-02', pg_temp.fid(98001))->>'state',
  'archived',
  'staff can archive an unreminded absence manually'
);
select is(
  (pg_temp.apply('restore', date '2026-10-03', pg_temp.fid(98001))->>'skipped'),
  'not_found',
  'restoring an absence with no follow-up is a no-op'
);

-- Direct writes still obey the state machine.
select throws_ok(
  $q$update private.tutoring_absence_followups set state = 'reminded', archived_at = null
     where absence_date = date '2026-10-01'
       and student_user_id = '00000000-0000-4000-8000-000000098021'$q$,
  '23514', null,
  'archived cannot move back to reminded'
);
select throws_ok(
  $q$update private.tutoring_absence_followups set reminded_at = now() - interval '1 day'
     where absence_date = date '2026-10-01'
       and student_user_id = '00000000-0000-4000-8000-000000098021'$q$,
  '23514', null,
  'the reminder time cannot be rewritten'
);
select throws_ok(
  $q$update private.tutoring_absence_followups set absence_date = date '2026-09-01'
     where absence_date = date '2026-10-01'
       and student_user_id = '00000000-0000-4000-8000-000000098021'$q$,
  '23514', null,
  'follow-up identity is immutable'
);
select throws_ok(
  $q$insert into private.tutoring_absence_followups(
       ws_id, group_id, student_user_id, absence_date, state, restored_at)
     values ('00000000-0000-4000-8000-000000098011', '00000000-0000-4000-8000-000000098031',
       '00000000-0000-4000-8000-000000098021', date '2026-10-05', 'restored', now())$q$,
  '23514', null,
  'a follow-up cannot start restored'
);
select throws_ok(
  $q$insert into private.tutoring_absence_followups(
       ws_id, group_id, student_user_id, absence_date, state, reminded_at)
     values ('00000000-0000-4000-8000-000000098011', '00000000-0000-4000-8000-000000098032',
       '00000000-0000-4000-8000-000000098021', date '2026-10-05', 'reminded', now())$q$,
  '23514', null,
  'a class from another workspace is rejected'
);
select throws_ok(
  $q$insert into private.tutoring_absence_followups(
       ws_id, group_id, student_user_id, absence_date, state, archived_at, archive_reason)
     values ('00000000-0000-4000-8000-000000098011', '00000000-0000-4000-8000-000000098031',
       '00000000-0000-4000-8000-000000098021', date '2026-10-06', 'archived', now(),
       'no_makeup_after_reminder')$q$,
  '23514', null,
  'automatic archive requires a prior reminder'
);

set local role service_role;
select throws_ok(
  $q$delete from private.tutoring_absence_followups
     where student_user_id = '00000000-0000-4000-8000-000000098021'$q$,
  '42501', null,
  'service_role cannot hard-delete a follow-up'
);

-- Append-only audit -------------------------------------------------------------

select throws_ok(
  $q$update private.tutoring_automation_events set action = 'restored'$q$,
  '42501', null,
  'service_role cannot update audit events'
);
select throws_ok(
  $q$delete from private.tutoring_automation_events$q$,
  '42501', null,
  'service_role cannot delete audit events'
);
select lives_ok(
  $q$insert into private.tutoring_automation_events(ws_id, subject_kind, subject_id, action)
     values ('00000000-0000-4000-8000-000000098011', 'lesson_report',
       '00000000-0000-4000-8000-000000098011', 'report_generated')$q$,
  'service_role can append audit events'
);
reset role;

select throws_ok(
  $q$update private.tutoring_automation_events set run_slot = 'rewritten'$q$,
  '42501', null,
  'even the table owner cannot update audit events'
);
select throws_ok(
  $q$insert into private.tutoring_automation_events(ws_id, subject_kind, subject_id, action, detail)
     values ('00000000-0000-4000-8000-000000098011', 'settings',
       '00000000-0000-4000-8000-000000098011', 'settings_changed',
       jsonb_build_object('x', repeat('a', 3000)))$q$,
  '23514', null,
  'audit detail is bounded'
);

-- Receipt kinds -------------------------------------------------------------------

select lives_ok(
  $q$insert into private.tutoring_notification_receipts(kind, ws_id, absence_followup_id, recipient_user_id)
     select 'absence_reminder', ws_id, id, '00000000-0000-4000-8000-000000098001'
     from private.tutoring_absence_followups where absence_date = date '2026-10-01'$q$,
  'an absence reminder receipt is accepted'
);
select throws_ok(
  $q$insert into private.tutoring_notification_receipts(kind, ws_id, absence_followup_id, recipient_user_id)
     select 'absence_reminder', ws_id, id, '00000000-0000-4000-8000-000000098001'
     from private.tutoring_absence_followups where absence_date = date '2026-10-01'$q$,
  '23505', null,
  'one absence reminder per follow-up and recipient'
);
select throws_ok(
  $q$insert into private.tutoring_notification_receipts(kind, ws_id, absence_followup_id, group_id, recipient_user_id)
     select 'absence_reminder', ws_id, id, group_id, '00000000-0000-4000-8000-000000098001'
     from private.tutoring_absence_followups where absence_date = date '2026-10-02'$q$,
  '23514', null,
  'an absence reminder receipt carries only its own key'
);
select lives_ok(
  $q$insert into private.tutoring_notification_receipts(kind, ws_id, report_date, recipient_user_id)
     values ('lesson_report', '00000000-0000-4000-8000-000000098011', date '2026-11-02',
       '00000000-0000-4000-8000-000000098001')$q$,
  'a lesson report receipt is accepted'
);
select throws_ok(
  $q$insert into private.tutoring_notification_receipts(kind, ws_id, report_date, recipient_user_id)
     values ('lesson_report', '00000000-0000-4000-8000-000000098011', date '2026-11-02',
       '00000000-0000-4000-8000-000000098001')$q$,
  '23505', null,
  'one lesson report per workspace, local date, and recipient'
);
select lives_ok(
  $q$insert into private.tutoring_notification_receipts(
       kind, group_id, student_user_id, review_cycle_started_at, recipient_user_id)
     values ('weak_content_review_due', '00000000-0000-4000-8000-000000098031',
       '00000000-0000-4000-8000-000000098021', now(), '00000000-0000-4000-8000-000000098001')$q$,
  'existing receipt kinds are unchanged'
);

-- Notification types ----------------------------------------------------------------

select ok(
  (select not convalidated from pg_constraint
   where conname = 'notifications_type_check'
     and conrelid = 'public.notifications'::regclass),
  'notification type constraint is NOT VALID: no scan under the exclusive lock'
);
select ok(
  (select pg_get_constraintdef(oid) ~ 'tutoring_session_completed'
     and pg_get_constraintdef(oid) ~ 'topic_assigned'
   from pg_constraint
   where conname = 'notifications_type_check'
     and conrelid = 'public.notifications'::regclass),
  'earlier notification types are preserved'
);
select is(
  (select count(*)::integer
   from unnest(array[
     'tutoring_absence_makeup_reminder',
     'tutoring_lesson_incomplete_report'
   ]) as kinds(kind)
   where public.create_notification(
     p_ws_id => pg_temp.fid(98011),
     p_user_id => pg_temp.fid(98001),
     p_type => kind,
     p_title => 'Synthetic tutoring automation',
     p_entity_type => 'tutoring_absence_followup',
     p_entity_id => pg_temp.fid(98011)
   ) is not null),
  2,
  'create_notification accepts both new tutoring types'
);

select * from finish();
rollback;
