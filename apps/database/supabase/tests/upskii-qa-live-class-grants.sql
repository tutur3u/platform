begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(34);
select set_config('request.jwt.claims', '{}', true);

insert into auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('ae610000-0000-4000-8000-000000000001', 'qa-operator@example.test', 'authenticated', now(), '{}', '{}');

select private.qa_test_reserve_users(
  'ae610000-0000-4000-8000-000000000001', null, 'upskii-e2e', 3600, 1, true, 'FREE', false
) as reservation \gset
select :'reservation'::jsonb #>> '{users,0,userId}' as host_id,
  :'reservation'::jsonb #>> '{users,0,email}' as host_email,
  :'reservation'::jsonb ->> 'runId' as run_id \gset
\set host_link 'ae610000-0000-4000-8000-000000000002'
\set real_link 'ae610000-0000-4000-8000-000000000003'
\set class_id 'ae610000-0000-4000-8000-000000000004'
\set operation_id 'ae610000-0000-4000-8000-000000000005'
\set real_id 'ae610000-0000-4000-8000-000000000001'

insert into auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values (:'host_id', :'host_email', 'authenticated', now(), '{}', '{}');
insert into private.external_account_links (id, provider, external_subject, user_id)
values (:'host_link', 'upskii', 'qa-teacher', :'host_id'),
       (:'real_link', 'upskii', 'real-teacher', :'real_id');
insert into private.upskii_live_class_grants (link_id) values (:'host_link');
select ok(not public.can_open_upskii_live_class(:'class_id', :'host_link', 'qa-teacher', :'host_id'),
  'a pending QA account cannot use ordinary consent');

-- Model a legacy reserved identity with no QA registry row.
set local session_replication_role = replica;
insert into auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('ae610000-0000-4000-8000-000000000007',
  'qa+footest0-999@tuturuuu.com', 'authenticated', now(), '{}', '{}');
set local session_replication_role = origin;
insert into private.external_account_links (id, provider, external_subject, user_id)
values ('ae610000-0000-4000-8000-000000000008', 'upskii', 'reserved-address',
  'ae610000-0000-4000-8000-000000000007');
insert into private.upskii_live_class_grants (link_id)
values ('ae610000-0000-4000-8000-000000000008');
select ok(not public.can_open_upskii_live_class(:'class_id',
  'ae610000-0000-4000-8000-000000000008', 'reserved-address',
  'ae610000-0000-4000-8000-000000000007'), 'the reserved address alone denies ordinary consent');

update auth.users set raw_app_meta_data = jsonb_build_object(
  'qa_test', true, 'qa_run', :'run_id', 'qa_staff', true,
  'qa_purpose', 'upskii-e2e', 'qa_expires_at', run.expires_at
)
from private.qa_test_runs run where run.id = :'run_id' and auth.users.id = :'host_id';
select private.qa_test_activate_user(:'host_id', :'real_id');
select id as workspace_id from public.workspaces
where personal is true and creator_id = :'host_id' \gset

set local role anon;
select throws_ok('select * from private.upskii_qa_live_class_grants', '42501', null, 'anon has no grant table access');
select throws_ok('select public.can_join_upskii_qa_live_class(null)', '42501', null, 'anon has no join RPC access');
reset role;
set local role authenticated;
select throws_ok('select * from private.upskii_qa_live_class_grants', '42501', null, 'authenticated has no grant table access');
select throws_ok('select public.can_open_upskii_live_class(null,null,null,null)', '42501', null, 'authenticated has no admission RPC access');
select throws_ok(
  'select public.open_upskii_live_class_room_with_qa_grant(null,null,null,null,null,null)',
  '42501', null, 'authenticated has no new room-open RPC access'
);
reset role;

set local role service_role;
select public.open_upskii_live_class_room(
  'legacy-class', :'host_link', 'qa-teacher', :'host_id', :'workspace_id', 'Legacy fixture'
) as legacy_open \gset
select is(:'legacy_open'::jsonb->>'kind', 'room', 'legacy room-open RPC still honors ordinary consent');
select :'legacy_open'::jsonb->>'meetingId' as legacy_meeting_id \gset
select ok(not public.can_join_upskii_qa_live_class(:'legacy_meeting_id'),
  'legacy QA room has a join fence before the new room-open RPC is used');
select ok(private.release_external_class_room('legacy-class', 'fixture release', 'pgTAP'),
  'the legacy class mapping can be released');
select ok(not public.can_join_upskii_qa_live_class(:'legacy_meeting_id'),
  'releasing the legacy mapping preserves the join fence');
select is(public.open_upskii_live_class_room_with_qa_grant(
  'legacy-class', :'host_link', 'qa-teacher', :'host_id', :'workspace_id', 'Legacy fixture'
)->>'kind', 'denied', 'new room-open RPC requires QA consent');
select ok(not public.can_open_upskii_live_class(:'class_id', :'host_link', 'qa-teacher', :'host_id'),
  'ordinary consent does not authorize an active QA account');
insert into private.upskii_qa_live_class_grants (operation_id, class_id, link_id, expires_at)
values (:'operation_id', :'class_id', :'host_link', now() + interval '10 minutes'),
       ('ae610000-0000-4000-8000-000000000006', :'class_id', :'real_link', now() + interval '10 minutes');
select ok(not public.can_open_upskii_live_class(:'class_id', :'real_link', 'real-teacher', :'real_id'),
  'QA consent does not authorize a real account');
select id as real_workspace_id from public.workspaces
where personal is true and creator_id = :'real_id' \gset
insert into private.upskii_live_class_grants (link_id) values (:'real_link');
select public.open_upskii_live_class_room(
  'ordinary-class', :'real_link', 'real-teacher', :'real_id', :'real_workspace_id', 'Ordinary class fixture'
) as ordinary_open \gset
select is(:'ordinary_open'::jsonb->>'kind', 'room', 'ordinary consent still opens a room');
select :'ordinary_open'::jsonb->>'meetingId' as ordinary_class_meeting_id \gset
select ok(not exists (
  select 1 from private.upskii_qa_live_class_meetings where meeting_id = :'ordinary_class_meeting_id'
), 'the capture trigger skips ordinary class rooms');
select ok(public.can_join_upskii_qa_live_class(:'ordinary_class_meeting_id'),
  'ordinary class rooms remain joinable');
select ok(not public.can_open_upskii_live_class(null, :'host_link', 'qa-teacher', :'host_id'),
  'QA status requires the exact class');
select ok(not public.can_open_upskii_live_class(:'class_id', :'host_link', 'other-teacher', :'host_id'),
  'the link must belong to the exact subject');
select is(public.open_upskii_live_class_room_with_qa_grant(
  'different-class', :'host_link', 'qa-teacher', :'host_id', :'workspace_id', 'QA fixture'
)->>'kind', 'denied', 'another class cannot create a room');
select public.open_upskii_live_class_room_with_qa_grant(
  :'class_id', :'host_link', 'qa-teacher', :'host_id', :'workspace_id', 'QA fixture'
)->>'meetingId' as meeting_id \gset
select ok(public.can_join_upskii_qa_live_class(:'meeting_id'), 'a live QA grant admits a direct join');
reset role;

insert into public.workspace_meetings (ws_id, creator_id, name, time)
values (:'workspace_id', :'host_id', 'Ordinary fixture', now())
returning id as ordinary_meeting_id \gset
select ok(public.can_join_upskii_qa_live_class(:'ordinary_meeting_id'), 'ordinary unbound meetings remain joinable');

update private.external_account_links set revoked_at = now(), revoked_by = 'admin' where id = :'host_link';
set local role service_role;
select ok(not public.can_open_upskii_live_class(:'class_id', :'host_link', 'qa-teacher', :'host_id'),
  'link revocation immediately denies class entitlement');
select is(public.open_upskii_live_class_room_with_qa_grant(
  :'class_id', :'host_link', 'qa-teacher', :'host_id', :'workspace_id', 'QA fixture'
)->>'kind', 'denied', 'link revocation prevents reopening');
select ok(not public.can_join_upskii_qa_live_class(:'meeting_id'), 'link revocation denies direct admission');
reset role;
update private.external_account_links set revoked_at = null, revoked_by = null where id = :'host_link';

-- Model legacy registry membership without a reserved address or auth marker.
select raw_app_meta_data as original_marker from auth.users where id = :'host_id' \gset
set local session_replication_role = replica;
update auth.users set email = 'metadata-stripped@example.test', raw_app_meta_data = '{}'
where id = :'host_id';
set local session_replication_role = origin;
select ok(not public.can_open_upskii_live_class(:'class_id', :'host_link', 'qa-teacher', :'host_id'),
  'QA registry membership denies ordinary consent without reserved email or metadata');
set local session_replication_role = replica;
update auth.users set email = :'host_email', raw_app_meta_data = :'original_marker'::jsonb
where id = :'host_id';
set local session_replication_role = origin;

update auth.users set banned_until = now() + interval '1 hour' where id = :'host_id';
select ok(not public.can_join_upskii_qa_live_class(:'meeting_id'), 'a banned QA host denies admission');
update auth.users set banned_until = null where id = :'host_id';
update private.qa_test_runs
set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
where id = :'run_id';
select ok(not public.can_join_upskii_qa_live_class(:'meeting_id'), 'an expired run denies admission');
update private.qa_test_runs set expires_at = now() + interval '1 hour' where id = :'run_id';
update private.qa_test_users set state = 'deleting' where user_id = :'host_id';
select ok(not public.can_join_upskii_qa_live_class(:'meeting_id'), 'deleting QA user denies admission');
update private.qa_test_users set state = 'active' where user_id = :'host_id';
update private.qa_test_runs set purpose = 'meet-rehearsal' where id = :'run_id';
select ok(not public.can_join_upskii_qa_live_class(:'meeting_id'), 'unrelated QA purpose denies admission');
update private.qa_test_runs set purpose = 'upskii-e2e' where id = :'run_id';


set local role service_role;
update private.upskii_qa_live_class_grants set expires_at = now() - interval '1 second'
where operation_id = :'operation_id';
select ok(not public.can_join_upskii_qa_live_class(:'meeting_id'), 'grant expiry denies direct Meet admission');
reset role;

update private.external_account_links set revoked_at = now(), revoked_by = 'admin' where id = :'host_link';
\set replacement_link 'ae610000-0000-4000-8000-000000000009'
insert into private.external_account_links (id, provider, external_subject, user_id)
values (:'replacement_link', 'upskii', 'qa-teacher', :'host_id');
insert into private.upskii_qa_live_class_grants (operation_id, class_id, link_id, expires_at)
values ('ae610000-0000-4000-8000-000000000010', :'class_id', :'replacement_link', now() + interval '10 minutes');
set local role service_role;
select is(public.open_upskii_live_class_room_with_qa_grant(
  :'class_id', :'replacement_link', 'qa-teacher', :'host_id', :'workspace_id', 'QA fixture'
)->>'meetingId', :'meeting_id', 'consented relink preserves the meeting');
select ok(public.can_join_upskii_qa_live_class(:'meeting_id'), 'the new grant admits the meeting');
reset role;
delete from private.external_account_links where id = :'replacement_link';
select ok(not public.can_join_upskii_qa_live_class(:'meeting_id'), 'deleting the link preserves the admission fence');

select * from finish();
rollback;
