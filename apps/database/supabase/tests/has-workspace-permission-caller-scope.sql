-- has_workspace_permission answers only for the caller under anon and
-- authenticated JWT roles at trigger depth 0. service_role, contexts without a
-- JWT and trigger bodies (notification recipient selection) stay unrestricted.
-- Migration: 20261028145500_scope_permission_check_to_caller.sql
begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select no_plan();

-- Fixtures: requester (workspace creator), manager (role grant), member (no
-- grant). The workspace insert adds the creator membership.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('5c400000-0000-4000-8000-000000000001', 'scope-requester@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5c400000-0000-4000-8000-000000000002', 'scope-manager@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5c400000-0000-4000-8000-000000000003', 'scope-member@example.com', now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.users (id)
values
  ('5c400000-0000-4000-8000-000000000001'),
  ('5c400000-0000-4000-8000-000000000002'),
  ('5c400000-0000-4000-8000-000000000003')
on conflict do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values ('5c400000-0000-4000-8000-0000000000a1', 'Caller scope fixture', false, '5c400000-0000-4000-8000-000000000001');

insert into public.workspace_members (ws_id, user_id, type)
values
  ('5c400000-0000-4000-8000-0000000000a1', '5c400000-0000-4000-8000-000000000002', 'MEMBER'),
  ('5c400000-0000-4000-8000-0000000000a1', '5c400000-0000-4000-8000-000000000003', 'MEMBER')
on conflict (ws_id, user_id) do update set type = 'MEMBER';

-- New workspaces get a MEMBER admin default; switch it off so only the role
-- grant below decides who holds manage_time_tracking_requests.
insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled)
values ('5c400000-0000-4000-8000-0000000000a1', 'admin', 'MEMBER', false)
on conflict (ws_id, permission, member_type) do update set enabled = excluded.enabled;

insert into public.workspace_roles (id, ws_id, name)
values ('5c400000-0000-4000-8000-0000000000b1', '5c400000-0000-4000-8000-0000000000a1', 'Scope reviewers');

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values ('5c400000-0000-4000-8000-0000000000a1', '5c400000-0000-4000-8000-0000000000b1', 'manage_time_tracking_requests', true);

insert into public.workspace_role_members (role_id, user_id)
values ('5c400000-0000-4000-8000-0000000000b1', '5c400000-0000-4000-8000-000000000002');

-- Web notifications on for both candidates, so only the permission decides.
insert into public.notification_preferences (ws_id, user_id, event_type, channel, enabled, scope)
values
  ('5c400000-0000-4000-8000-0000000000a1', '5c400000-0000-4000-8000-000000000002', 'time_tracking_request_submitted', 'web', true, 'workspace'),
  ('5c400000-0000-4000-8000-0000000000a1', '5c400000-0000-4000-8000-000000000003', 'time_tracking_request_submitted', 'web', true, 'workspace'),
  ('5c400000-0000-4000-8000-0000000000a1', '5c400000-0000-4000-8000-000000000002', 'time_tracking_request_resubmitted', 'web', true, 'workspace'),
  ('5c400000-0000-4000-8000-0000000000a1', '5c400000-0000-4000-8000-000000000003', 'time_tracking_request_resubmitted', 'web', true, 'workspace'),
  ('5c400000-0000-4000-8000-0000000000a1', '5c400000-0000-4000-8000-000000000001', 'time_tracking_request_needs_info', 'web', true, 'workspace'),
  ('5c400000-0000-4000-8000-0000000000a1', '5c400000-0000-4000-8000-000000000001', 'time_tracking_request_approved', 'web', true, 'workspace')
on conflict do nothing;

update public.notification_preferences
set enabled = true
where ws_id = '5c400000-0000-4000-8000-0000000000a1'
  and event_type in (
    'time_tracking_request_submitted',
    'time_tracking_request_resubmitted',
    'time_tracking_request_needs_info',
    'time_tracking_request_approved'
  )
  and channel = 'web';

-- No JWT (claims never set in this session): unrestricted.
select ok(
  public.has_workspace_permission(
    '5c400000-0000-4000-8000-0000000000a1',
    '5c400000-0000-4000-8000-000000000002',
    'manage_time_tracking_requests'
  ),
  'without a JWT the manager permission is reported'
);

select ok(
  not public.has_workspace_permission(
    '5c400000-0000-4000-8000-0000000000a1',
    '5c400000-0000-4000-8000-000000000003',
    'manage_time_tracking_requests'
  ),
  'without a JWT the ungranted member is denied'
);

-- anon asking about a real member.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select ok(
  not public.has_workspace_permission(
    '5c400000-0000-4000-8000-0000000000a1',
    '5c400000-0000-4000-8000-000000000002',
    'manage_time_tracking_requests'
  ),
  'anon asking about a member gets false'
);

reset role;

-- authenticated as the manager.
set local role authenticated;
set local request.jwt.claims to '{"role":"authenticated","sub":"5c400000-0000-4000-8000-000000000002"}';

select ok(
  public.has_workspace_permission(
    '5c400000-0000-4000-8000-0000000000a1',
    '5c400000-0000-4000-8000-000000000002',
    'manage_time_tracking_requests'
  ),
  'authenticated asking about itself gets its real permission'
);

select ok(
  not public.has_workspace_permission(
    '5c400000-0000-4000-8000-0000000000a1',
    '5c400000-0000-4000-8000-000000000001',
    'manage_time_tracking_requests'
  ),
  'authenticated asking about another user (the creator) gets false at depth 0'
);

reset role;

-- authenticated as the ungranted member, asking about the manager.
set local role authenticated;
set local request.jwt.claims to '{"role":"authenticated","sub":"5c400000-0000-4000-8000-000000000003"}';

select ok(
  not public.has_workspace_permission(
    '5c400000-0000-4000-8000-0000000000a1',
    '5c400000-0000-4000-8000-000000000002',
    'manage_time_tracking_requests'
  ),
  'authenticated member asking about the manager gets false'
);

reset role;

-- service_role answers for other users.
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';

select ok(
  public.has_workspace_permission(
    '5c400000-0000-4000-8000-0000000000a1',
    '5c400000-0000-4000-8000-000000000002',
    'manage_time_tracking_requests'
  ),
  'service_role asking about another user gets the real permission'
);

reset role;

-- Empty claims (no JWT) answer for other users.
select set_config('request.jwt.claims', '', true);

-- Legacy per-claim settings are honoured too.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5c400000-0000-4000-8000-000000000002', true);

select ok(
  public.has_workspace_permission(
    '5c400000-0000-4000-8000-0000000000a1',
    '5c400000-0000-4000-8000-000000000002',
    'manage_time_tracking_requests'
  ),
  'legacy claim settings: authenticated asking about itself gets its real permission'
);

select ok(
  not public.has_workspace_permission(
    '5c400000-0000-4000-8000-0000000000a1',
    '5c400000-0000-4000-8000-000000000001',
    'manage_time_tracking_requests'
  ),
  'legacy claim settings: authenticated asking about another user gets false'
);

select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', '', true);

select ok(
  public.has_workspace_permission(
    '5c400000-0000-4000-8000-0000000000a1',
    '5c400000-0000-4000-8000-000000000002',
    'manage_time_tracking_requests'
  ),
  'empty claims ask about another user unrestricted'
);

-- Trigger depth > 0: the requester submits with an authenticated JWT; the
-- submitted-notification trigger still selects the manager as a recipient.
-- authenticated has no private schema access, so the insert runs as the
-- owner with the requester's claims, as a definer write path would.
set local request.jwt.claims to '{"role":"authenticated","sub":"5c400000-0000-4000-8000-000000000001"}';

select ok(
  not public.has_workspace_permission(
    '5c400000-0000-4000-8000-0000000000a1',
    '5c400000-0000-4000-8000-000000000002',
    'manage_time_tracking_requests'
  ),
  'the requester JWT cannot ask about the manager directly'
);

insert into private.time_tracking_requests (id, workspace_id, user_id, title, start_time, end_time)
values (
  '5c400000-0000-4000-8000-0000000000c1',
  '5c400000-0000-4000-8000-0000000000a1',
  '5c400000-0000-4000-8000-000000000001',
  'Caller scope request',
  now() - interval '1 hour',
  now()
);

select is(
  (select count(*) from public.notifications
   where entity_id = '5c400000-0000-4000-8000-0000000000c1'
     and type = 'time_tracking_request_submitted'
     and user_id = '5c400000-0000-4000-8000-000000000002'),
  1::bigint,
  'the manager receives the submitted notification under the requester JWT'
);

select is(
  (select count(*) from public.notifications
   where entity_id = '5c400000-0000-4000-8000-0000000000c1'
     and user_id = '5c400000-0000-4000-8000-000000000003'),
  0::bigint,
  'a member without the permission receives no notification'
);

-- The update guard ignores the actor override under an end-user JWT: the
-- ungranted member cannot borrow the manager's permission. Honouring the
-- override would make the manager the actor and raise 'Approvers cannot
-- modify request content fields' instead.
set local request.jwt.claims to '{"role":"authenticated","sub":"5c400000-0000-4000-8000-000000000003"}';
select set_config('time_tracking.override_auth_uid', '5c400000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$update private.time_tracking_requests
    set title = 'Changed by another member'
    where id = '5c400000-0000-4000-8000-0000000000c1'$$,
  'P0001',
  'Only approvers can update requests submitted by other users',
  'the update guard binds the actor to the caller under an end-user JWT'
);

select set_config('time_tracking.override_auth_uid', '', true);

-- Status changes under authenticated JWTs: the status-change trigger still
-- notifies the requester, and on resubmission selects the manager (the branch
-- that evaluates other members) but not the ungranted member.
set local request.jwt.claims to '{"role":"authenticated","sub":"5c400000-0000-4000-8000-000000000002"}';

select lives_ok(
  $$update private.time_tracking_requests
    set approval_status = 'NEEDS_INFO',
        needs_info_requested_by = '5c400000-0000-4000-8000-000000000002',
        needs_info_requested_at = now(),
        needs_info_reason = 'Add detail'
    where id = '5c400000-0000-4000-8000-0000000000c1'$$,
  'the manager requests more information under an authenticated JWT'
);

select is(
  (select count(*) from public.notifications
   where entity_id = '5c400000-0000-4000-8000-0000000000c1'
     and type = 'time_tracking_request_needs_info'
     and user_id = '5c400000-0000-4000-8000-000000000001'),
  1::bigint,
  'the requester receives the needs-info notification'
);

set local request.jwt.claims to '{"role":"authenticated","sub":"5c400000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$update private.time_tracking_requests
    set approval_status = 'PENDING',
        needs_info_requested_by = null,
        needs_info_requested_at = null,
        needs_info_reason = null
    where id = '5c400000-0000-4000-8000-0000000000c1'$$,
  'the requester resubmits under an authenticated JWT'
);

select is(
  (select count(*) from public.notifications
   where entity_id = '5c400000-0000-4000-8000-0000000000c1'
     and type = 'time_tracking_request_resubmitted'
     and user_id = '5c400000-0000-4000-8000-000000000002'),
  1::bigint,
  'the manager receives the resubmitted notification under the requester JWT'
);

select is(
  (select count(*) from public.notifications
   where entity_id = '5c400000-0000-4000-8000-0000000000c1'
     and type = 'time_tracking_request_resubmitted'
     and user_id = '5c400000-0000-4000-8000-000000000003'),
  0::bigint,
  'a member without the permission receives no resubmitted notification'
);

set local request.jwt.claims to '{"role":"authenticated","sub":"5c400000-0000-4000-8000-000000000002"}';

select lives_ok(
  $$update private.time_tracking_requests
    set approval_status = 'APPROVED',
        approved_by = '5c400000-0000-4000-8000-000000000002',
        approved_at = now()
    where id = '5c400000-0000-4000-8000-0000000000c1'$$,
  'the manager approves under an authenticated JWT'
);

select is(
  (select count(*) from public.notifications
   where entity_id = '5c400000-0000-4000-8000-0000000000c1'
     and type = 'time_tracking_request_approved'
     and user_id = '5c400000-0000-4000-8000-000000000001'),
  1::bigint,
  'the requester receives the approved notification'
);

-- service_role still honours the actor override (the path used by
-- private.update_time_tracking_request): without it there is no actor and
-- the guard raises.
set local request.jwt.claims to '{"role":"service_role"}';

insert into private.time_tracking_requests (id, workspace_id, user_id, title, start_time, end_time)
values (
  '5c400000-0000-4000-8000-0000000000c2',
  '5c400000-0000-4000-8000-0000000000a1',
  '5c400000-0000-4000-8000-000000000001',
  'Caller scope service request',
  now() - interval '2 hours',
  now() - interval '1 hour'
);

select set_config('time_tracking.override_auth_uid', '5c400000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$update private.time_tracking_requests
    set approval_status = 'APPROVED',
        approved_by = '5c400000-0000-4000-8000-000000000002',
        approved_at = now()
    where id = '5c400000-0000-4000-8000-0000000000c2'$$,
  'service_role approves as the override actor'
);

select is(
  (select approved_by from private.time_tracking_requests
   where id = '5c400000-0000-4000-8000-0000000000c2'),
  '5c400000-0000-4000-8000-000000000002'::uuid,
  'the override actor is recorded as the approver'
);

select is(
  (select count(*) from public.notifications
   where entity_id = '5c400000-0000-4000-8000-0000000000c2'
     and type = 'time_tracking_request_approved'
     and user_id = '5c400000-0000-4000-8000-000000000001'),
  1::bigint,
  'the requester receives the approved notification from the service path'
);

select set_config('time_tracking.override_auth_uid', '', true);
select set_config('request.jwt.claims', '', true);

-- The ACL and definer mode are unchanged.
select ok(
  (select prosecdef from pg_proc
   where oid = 'public.has_workspace_permission(uuid,uuid,text)'::regprocedure),
  'has_workspace_permission stays SECURITY DEFINER'
);

select ok(
  has_function_privilege('anon', 'public.has_workspace_permission(uuid,uuid,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.has_workspace_permission(uuid,uuid,text)', 'EXECUTE'),
  'anon and authenticated keep EXECUTE for RLS evaluation'
);


reset role;
set local role authenticated;
select set_config($$request.jwt.claim.role$$,$$authenticated$$,true);
select set_config($$request.jwt.claims$$,$${"sub":"5c400000-0000-4000-8000-000000000002","role":"authenticated"}$$,true);
select ok(public.is_org_member($$5c400000-0000-4000-8000-000000000002$$,$$5c400000-0000-4000-8000-0000000000a1$$), $$member can check self$$);
select ok(not public.is_org_member($$5c400000-0000-4000-8000-000000000003$$,$$5c400000-0000-4000-8000-0000000000a1$$), $$member cannot probe another member$$);
reset role;
set local role service_role;
select set_config($$request.jwt.claim.role$$,$$service_role$$,true);
select set_config($$request.jwt.claims$$,$${"role":"service_role"}$$,true);
select ok(public.is_org_member($$5c400000-0000-4000-8000-000000000003$$,$$5c400000-0000-4000-8000-0000000000a1$$), $$service membership checks remain unrestricted$$);
reset role;
select * from finish();

rollback;
