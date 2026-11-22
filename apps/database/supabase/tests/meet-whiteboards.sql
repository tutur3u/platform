-- Meet whiteboard links (20261123021000): a service-only private table written
-- through actor-bound functions. The host or a workspace admin links a board;
-- the link creator, host or admin changes guest access or unlinks; members,
-- outsiders and guest-type members are refused; workspace scope guards and
-- cascades hold; clients reach nothing.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('3b0a0000-0000-4000-8000-000000000001', 'mwb-owner@example.com', now(), '{}', '{}'),
  ('3b0a0000-0000-4000-8000-000000000002', 'mwb-host@example.com', now(), '{}', '{}'),
  ('3b0a0000-0000-4000-8000-000000000003', 'mwb-member@example.com', now(), '{}', '{}'),
  ('3b0a0000-0000-4000-8000-000000000004', 'mwb-admin@example.com', now(), '{}', '{}'),
  ('3b0a0000-0000-4000-8000-000000000005', 'mwb-outsider@example.com', now(), '{}', '{}'),
  ('3b0a0000-0000-4000-8000-000000000006', 'mwb-guest@example.com', now(), '{}', '{}'),
  ('3b0a0000-0000-4000-8000-000000000007', 'mwb-linker@example.com', now(), '{}', '{}'),
  ('3b0a0000-0000-4000-8000-000000000008', 'mwb-former@example.com', now(), '{}', '{}');

insert into public.workspaces (id, name, personal, creator_id) values
  ('3b0a0000-0000-4000-8000-0000000000a1', 'MWB workspace', false, '3b0a0000-0000-4000-8000-000000000001'),
  ('3b0a0000-0000-4000-8000-0000000000a2', 'MWB other', false, '3b0a0000-0000-4000-8000-000000000005');

-- Ordinary members must not inherit admin through the workspace defaults.
update public.workspace_default_permissions set enabled = false
where ws_id = '3b0a0000-0000-4000-8000-0000000000a1' and permission = 'admin';

insert into public.workspace_members (ws_id, user_id, type) values
  ('3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000002', 'MEMBER'),
  ('3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000003', 'MEMBER'),
  ('3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000004', 'MEMBER'),
  ('3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000006', 'GUEST'),
  ('3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000007', 'MEMBER'),
  ('3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000008', 'MEMBER')
on conflict do nothing;

insert into public.workspace_roles (id, ws_id, name)
values ('3b0a0000-0000-4000-8000-0000000000c1', '3b0a0000-0000-4000-8000-0000000000a1', 'MWB admin');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values ('3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-0000000000c1', 'admin', true);
insert into public.workspace_role_members (role_id, user_id)
values ('3b0a0000-0000-4000-8000-0000000000c1', '3b0a0000-0000-4000-8000-000000000004');

insert into public.workspace_meetings (id, ws_id, creator_id, name) values
  ('3b0a0000-0000-4000-8000-0000000000b1', '3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000002', 'MWB standup'),
  ('3b0a0000-0000-4000-8000-0000000000b2', '3b0a0000-0000-4000-8000-0000000000a2', '3b0a0000-0000-4000-8000-000000000005', 'MWB foreign'),
  ('3b0a0000-0000-4000-8000-0000000000b3', '3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000002', 'MWB retro');

insert into public.workspace_whiteboards (id, ws_id, creator_id, title) values
  ('3b0a0000-0000-4000-8000-0000000000d1', '3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000002', 'Board one'),
  ('3b0a0000-0000-4000-8000-0000000000d2', '3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000002', 'Board two'),
  ('3b0a0000-0000-4000-8000-0000000000d3', '3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000002', 'Board three'),
  ('3b0a0000-0000-4000-8000-0000000000d4', '3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000002', 'Board four'),
  ('3b0a0000-0000-4000-8000-0000000000d5', '3b0a0000-0000-4000-8000-0000000000a2', '3b0a0000-0000-4000-8000-000000000005', 'Foreign board'),
  ('3b0a0000-0000-4000-8000-0000000000d6', '3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000001', 'Orphan board'),
  ('3b0a0000-0000-4000-8000-0000000000d7', '3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000001', 'Former member board'),
  ('3b0a0000-0000-4000-8000-0000000000d8', '3b0a0000-0000-4000-8000-0000000000a1', '3b0a0000-0000-4000-8000-000000000001', 'Archived board');
update public.workspace_whiteboards set archived_at = now()
where id = '3b0a0000-0000-4000-8000-0000000000d8';

create temporary table mwb_ids as select
  '3b0a0000-0000-4000-8000-000000000001'::uuid as owner,
  '3b0a0000-0000-4000-8000-000000000002'::uuid as host,
  '3b0a0000-0000-4000-8000-000000000003'::uuid as member,
  '3b0a0000-0000-4000-8000-000000000004'::uuid as admin,
  '3b0a0000-0000-4000-8000-000000000005'::uuid as outsider,
  '3b0a0000-0000-4000-8000-000000000006'::uuid as guest_member,
  '3b0a0000-0000-4000-8000-000000000007'::uuid as linker,
  '3b0a0000-0000-4000-8000-000000000008'::uuid as former,
  '3b0a0000-0000-4000-8000-0000000000a1'::uuid as ws,
  '3b0a0000-0000-4000-8000-0000000000a2'::uuid as other_ws,
  '3b0a0000-0000-4000-8000-0000000000b1'::uuid as m1,
  '3b0a0000-0000-4000-8000-0000000000b2'::uuid as m_foreign,
  '3b0a0000-0000-4000-8000-0000000000b3'::uuid as m3,
  '3b0a0000-0000-4000-8000-0000000000d1'::uuid as b1,
  '3b0a0000-0000-4000-8000-0000000000d2'::uuid as b2,
  '3b0a0000-0000-4000-8000-0000000000d3'::uuid as b3,
  '3b0a0000-0000-4000-8000-0000000000d4'::uuid as b4,
  '3b0a0000-0000-4000-8000-0000000000d5'::uuid as b_foreign,
  '3b0a0000-0000-4000-8000-0000000000d6'::uuid as b_orphan,
  '3b0a0000-0000-4000-8000-0000000000d7'::uuid as b_former,
  '3b0a0000-0000-4000-8000-0000000000d8'::uuid as b_archived;
grant select on mwb_ids to service_role, authenticated, anon;

-- Catalog and ACL contract.
select ok((select relrowsecurity from pg_class where oid = 'private.meet_whiteboards'::regclass),
  'meet_whiteboards keeps row level security enabled');
select ok(not has_table_privilege('anon', 'private.meet_whiteboards', 'select, insert, update, delete, truncate, references, trigger')
  and not has_table_privilege('authenticated', 'private.meet_whiteboards', 'select, insert, update, delete, truncate, references, trigger'),
  'client roles hold no meet_whiteboards privilege');
select ok(has_table_privilege('service_role', 'private.meet_whiteboards', 'select, insert, update, delete'),
  'service role keeps meet_whiteboards operations');
select ok(not exists (
  select 1 from pg_class c cross join lateral aclexplode(c.relacl) acl
  where c.oid = 'private.meet_whiteboards'::regclass and acl.grantee = 0
), 'meet_whiteboards has no PUBLIC ACL');
select ok(not exists (
  select 1 from pg_policies where schemaname = 'private' and tablename = 'meet_whiteboards'
    and not (roles = array['service_role'::name])
), 'only the service role has a policy');
select ok(not has_schema_privilege('authenticated', 'private', 'usage')
  and not has_schema_privilege('anon', 'private', 'usage'),
  'client roles cannot use the private schema');

select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname in
    ('link_meet_whiteboard', 'set_meet_whiteboard_guest_access', 'unlink_meet_whiteboard')
    and p.prosecdef
    and has_function_privilege('service_role', p.oid, 'execute')
    and not has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute')
    and p.proconfig = array['search_path=pg_catalog, pg_temp']), 3,
  'the three actor-bound functions are definer, pinned and service-only');
select ok(not has_function_privilege('service_role', 'private.meet_whiteboard_can_manage(uuid,uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.guard_meet_whiteboard_scope()', 'execute')
  and not has_function_privilege('service_role', 'private.guard_meet_whiteboard_parent_move()', 'execute')
  and not has_function_privilege('authenticated', 'private.meet_whiteboard_can_manage(uuid,uuid)', 'execute'),
  'helper and trigger functions are not callable by any client or service role');

-- Clients cannot reach the table or the functions at all.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3b0a0000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$select 1 from private.meet_whiteboards$$, '42501', null, 'authenticated cannot read links');
select throws_ok($$select private.link_meet_whiteboard('3b0a0000-0000-4000-8000-000000000002',
  '3b0a0000-0000-4000-8000-0000000000b1', '3b0a0000-0000-4000-8000-0000000000d1')$$,
  '42501', null, 'the host cannot call the link function as a client');
reset role;
set local role anon;
select throws_ok($$select 1 from private.meet_whiteboards$$, '42501', null, 'anon cannot read links');
reset role;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

-- Link creation.
select throws_ok($$select private.link_meet_whiteboard((select member from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids))$$,
  '42501', null, 'an ordinary member cannot link a board');
select throws_ok($$select private.link_meet_whiteboard((select outsider from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids))$$,
  '42501', null, 'a member of another workspace cannot link a board');
select throws_ok($$select private.link_meet_whiteboard((select guest_member from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids))$$,
  '42501', null, 'a guest-type workspace member cannot link a board');
select throws_ok($$select private.link_meet_whiteboard((select host from mwb_ids), (select m1 from mwb_ids), (select b_foreign from mwb_ids))$$,
  'P0002', null, 'a board from another workspace is reported exactly like a missing one');
select throws_ok($$select private.link_meet_whiteboard((select host from mwb_ids), (select m1 from mwb_ids), (select b_archived from mwb_ids))$$,
  '55000', null, 'an archived board cannot be linked');
select throws_ok($$select private.link_meet_whiteboard((select member from mwb_ids), (select m1 from mwb_ids), (select b_archived from mwb_ids))$$,
  '42501', null, 'authorization is checked before the archived state is revealed');
select throws_ok($$select private.link_meet_whiteboard((select host from mwb_ids), gen_random_uuid(), (select b1 from mwb_ids))$$,
  '42501', null, 'an unknown meeting is indistinguishable from one the actor cannot manage');
select throws_ok($$select private.link_meet_whiteboard((select host from mwb_ids), (select m1 from mwb_ids), gen_random_uuid())$$,
  'P0002', null, 'an unknown whiteboard is reported as missing');
select throws_ok($$select private.link_meet_whiteboard((select host from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids), 'edit')$$,
  '22023', null, 'guest_access outside none, view and draw is refused');
select throws_ok($$select private.link_meet_whiteboard(null, (select m1 from mwb_ids), (select b1 from mwb_ids))$$,
  '22023', null, 'an anonymous actor is refused');

select is((select (private.link_meet_whiteboard((select host from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids))).guest_access),
  'view', 'the host links a board; guest_access defaults to view');
select is((select created_by from private.meet_whiteboards where whiteboard_id = (select b1 from mwb_ids)),
  (select host from mwb_ids), 'the link records the actor as its creator');
select is((select (private.link_meet_whiteboard((select admin from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids), 'draw')).guest_access),
  'view', 'linking an already linked board keeps the existing link unchanged');
select is((select (private.link_meet_whiteboard((select admin from mwb_ids), (select m1 from mwb_ids), (select b2 from mwb_ids), 'draw')).guest_access),
  'draw', 'a workspace admin links a board on another host meeting');
select is((select (private.link_meet_whiteboard((select owner from mwb_ids), (select m1 from mwb_ids), (select b3 from mwb_ids), 'none')).guest_access),
  'none', 'the workspace creator, who holds admin, links a board');

-- Seed a link made by a former host so creator rights can be tested.
insert into private.meet_whiteboards (meeting_id, whiteboard_id, ws_id, created_by, updated_at)
select m3, b1, ws, linker, now() - interval '1 day' from mwb_ids;

-- Changing guest access.
select throws_ok($$select private.set_meet_whiteboard_guest_access((select member from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids), 'draw')$$,
  '42501', null, 'an ordinary member cannot change guest_access');
select throws_ok($$select private.set_meet_whiteboard_guest_access((select outsider from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids), 'draw')$$,
  '42501', null, 'a member of another workspace cannot change guest_access');
select throws_ok($$select private.set_meet_whiteboard_guest_access((select guest_member from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids), 'draw')$$,
  '42501', null, 'a guest-type workspace member cannot change guest_access');
select throws_ok($$select private.set_meet_whiteboard_guest_access((select linker from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids), 'draw')$$,
  '42501', null, 'a link creator cannot change a link they did not create');
select throws_ok($$select private.set_meet_whiteboard_guest_access((select host from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids), 'edit')$$,
  '22023', null, 'an invalid guest_access value is refused');
select throws_ok($$select private.set_meet_whiteboard_guest_access((select host from mwb_ids), (select m1 from mwb_ids), (select b4 from mwb_ids), 'draw')$$,
  'P0002', null, 'a missing link is reported as missing to a meeting manager');
select throws_ok($$select private.set_meet_whiteboard_guest_access((select member from mwb_ids), (select m1 from mwb_ids), (select b4 from mwb_ids), 'draw')$$,
  '42501', null, 'a missing link is indistinguishable from a forbidden one for a member');
select throws_ok($$select private.set_meet_whiteboard_guest_access((select outsider from mwb_ids), gen_random_uuid(), gen_random_uuid(), 'draw')$$,
  '42501', null, 'unknown meeting and board ids give an outsider nothing');
select is((select (private.set_meet_whiteboard_guest_access((select host from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids), 'draw')).guest_access),
  'draw', 'the host changes guest_access');
select is((select (private.set_meet_whiteboard_guest_access((select admin from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids), 'none')).guest_access),
  'none', 'a workspace admin changes guest_access');
select is((select (private.set_meet_whiteboard_guest_access((select linker from mwb_ids), (select m3 from mwb_ids), (select b1 from mwb_ids), 'draw')).guest_access),
  'draw', 'the link creator changes guest_access without being host or admin');
select ok((select updated_at > now() - interval '1 hour' from private.meet_whiteboards
  where meeting_id = (select m3 from mwb_ids) and whiteboard_id = (select b1 from mwb_ids)),
  'changing guest_access refreshes updated_at');

-- Removing links.
select throws_ok($$select private.unlink_meet_whiteboard((select member from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids))$$,
  '42501', null, 'an ordinary member cannot unlink');
select throws_ok($$select private.unlink_meet_whiteboard((select outsider from mwb_ids), (select m1 from mwb_ids), (select b1 from mwb_ids))$$,
  '42501', null, 'a member of another workspace cannot unlink');
select throws_ok($$select private.unlink_meet_whiteboard((select host from mwb_ids), (select m1 from mwb_ids), (select b4 from mwb_ids))$$,
  'P0002', null, 'unlinking a missing link is reported as missing to a meeting manager');
select throws_ok($$select private.unlink_meet_whiteboard((select member from mwb_ids), (select m1 from mwb_ids), (select b4 from mwb_ids))$$,
  '42501', null, 'a missing link is indistinguishable from a forbidden unlink for a member');
select ok((select private.unlink_meet_whiteboard((select linker from mwb_ids), (select m3 from mwb_ids), (select b1 from mwb_ids))),
  'the link creator removes their link');
select ok((select private.unlink_meet_whiteboard((select host from mwb_ids), (select m1 from mwb_ids), (select b2 from mwb_ids))),
  'the host removes a link an admin created');
select ok((select private.unlink_meet_whiteboard((select admin from mwb_ids), (select m1 from mwb_ids), (select b3 from mwb_ids))),
  'a workspace admin removes a link');
select is((select count(*)::integer from private.meet_whiteboards where meeting_id = (select m1 from mwb_ids)), 1,
  'only the unrelated link remains on the meeting');

-- A link with no recorded creator grants nothing to ordinary members.
insert into private.meet_whiteboards (meeting_id, whiteboard_id, ws_id, created_by)
select m1, b_orphan, ws, null from mwb_ids;
select throws_ok($$select private.set_meet_whiteboard_guest_access((select member from mwb_ids), (select m1 from mwb_ids), (select b_orphan from mwb_ids), 'draw')$$,
  '42501', null, 'a member cannot change guest_access on a link with no creator');
select throws_ok($$select private.unlink_meet_whiteboard((select member from mwb_ids), (select m1 from mwb_ids), (select b_orphan from mwb_ids))$$,
  '42501', null, 'a member cannot unlink a link with no creator');
select is((select (private.set_meet_whiteboard_guest_access((select host from mwb_ids), (select m1 from mwb_ids), (select b_orphan from mwb_ids), 'draw')).guest_access),
  'draw', 'the host still manages a link with no creator');
select ok((select private.unlink_meet_whiteboard((select admin from mwb_ids), (select m1 from mwb_ids), (select b_orphan from mwb_ids))),
  'a workspace admin still removes a link with no creator');

-- A creator who left the workspace loses control of their link.
insert into private.meet_whiteboards (meeting_id, whiteboard_id, ws_id, created_by)
select m1, b_former, ws, former from mwb_ids;
select is((select (private.set_meet_whiteboard_guest_access((select former from mwb_ids), (select m1 from mwb_ids), (select b_former from mwb_ids), 'draw')).guest_access),
  'draw', 'a creator who is still a member changes guest_access');
delete from public.workspace_members
where ws_id = (select ws from mwb_ids) and user_id = (select former from mwb_ids);
select throws_ok($$select private.set_meet_whiteboard_guest_access((select former from mwb_ids), (select m1 from mwb_ids), (select b_former from mwb_ids), 'none')$$,
  '42501', null, 'a creator who left the workspace cannot change guest_access');
select throws_ok($$select private.unlink_meet_whiteboard((select former from mwb_ids), (select m1 from mwb_ids), (select b_former from mwb_ids))$$,
  '42501', null, 'a creator who left the workspace cannot unlink');

-- Archiving a linked board keeps the link but stops guest access from rising.
select is((select (private.link_meet_whiteboard((select host from mwb_ids), (select m1 from mwb_ids), (select b_orphan from mwb_ids), 'view')).guest_access),
  'view', 'an active board links');
update public.workspace_whiteboards set archived_at = now() where id = (select b_orphan from mwb_ids);
select is((select count(*)::integer from private.meet_whiteboards where whiteboard_id = (select b_orphan from mwb_ids)), 1,
  'archiving a board keeps its link');
select throws_ok($$select private.set_meet_whiteboard_guest_access((select member from mwb_ids), (select m1 from mwb_ids), (select b_orphan from mwb_ids), 'draw')$$,
  '42501', null, 'authorization is checked before the archived state when raising access');
select throws_ok($$select private.set_meet_whiteboard_guest_access((select host from mwb_ids), (select m1 from mwb_ids), (select b_orphan from mwb_ids), 'draw')$$,
  '55000', null, 'guest_access cannot be raised to draw on an archived board');
select is((select (private.set_meet_whiteboard_guest_access((select host from mwb_ids), (select m1 from mwb_ids), (select b_orphan from mwb_ids), 'view')).guest_access),
  'view', 'an unchanged level is allowed on an archived board');
select is((select (private.set_meet_whiteboard_guest_access((select host from mwb_ids), (select m1 from mwb_ids), (select b_orphan from mwb_ids), 'none')).guest_access),
  'none', 'guest_access can be lowered on an archived board');
select throws_ok($$select private.set_meet_whiteboard_guest_access((select host from mwb_ids), (select m1 from mwb_ids), (select b_orphan from mwb_ids), 'view')$$,
  '55000', null, 'guest_access cannot be raised from none on an archived board');
select ok((select private.unlink_meet_whiteboard((select host from mwb_ids), (select m1 from mwb_ids), (select b_orphan from mwb_ids))),
  'an archived board can be unlinked');

-- Table-level scope guards apply to every writer, including the service role.
select throws_ok($$
  insert into private.meet_whiteboards (meeting_id, whiteboard_id, ws_id)
  select m1, b_foreign, ws from mwb_ids
$$, '23514', null, 'a board from another workspace is rejected');
select throws_ok($$
  insert into private.meet_whiteboards (meeting_id, whiteboard_id, ws_id)
  select m_foreign, b1, ws from mwb_ids
$$, '23514', null, 'a meeting from another workspace is rejected');
select throws_ok($$
  insert into private.meet_whiteboards (meeting_id, whiteboard_id, ws_id)
  select m3, b2, other_ws from mwb_ids
$$, '23514', null, 'a ws_id that matches neither parent is rejected');
select throws_ok($$
  insert into private.meet_whiteboards (meeting_id, whiteboard_id, ws_id, guest_access)
  select m3, b2, ws, 'edit' from mwb_ids
$$, '23514', null, 'guest_access is limited to none, view and draw');
select throws_ok($$
  update private.meet_whiteboards set ws_id = (select other_ws from mwb_ids)
  where meeting_id = (select m1 from mwb_ids)
$$, '23514', null, 'an existing link cannot be moved to another workspace');
select throws_ok($$
  update public.workspace_whiteboards set ws_id = (select other_ws from mwb_ids)
  where id = (select b1 from mwb_ids)
$$, '23514', null, 'a linked whiteboard cannot change workspace');
select throws_ok($$
  update public.workspace_meetings set ws_id = (select other_ws from mwb_ids)
  where id = (select m1 from mwb_ids)
$$, '23514', null, 'a linked meeting cannot change workspace');
select lives_ok($$
  update public.workspace_whiteboards set ws_id = (select other_ws from mwb_ids)
  where id = (select b4 from mwb_ids)
$$, 'an unlinked whiteboard can still change workspace');
select is((select ws_id from public.workspace_whiteboards where id = (select b4 from mwb_ids)),
  (select other_ws from mwb_ids), 'the unlinked whiteboard moved');

-- Cascades: a board delete drops only its link; a meeting delete keeps boards.
insert into private.meet_whiteboards (meeting_id, whiteboard_id, ws_id)
select m3, b2, ws from mwb_ids;
delete from public.workspace_whiteboards where id = (select b2 from mwb_ids);
select is((select count(*)::integer from private.meet_whiteboards
  where whiteboard_id = (select b2 from mwb_ids)), 0, 'deleting a board removes its link');
select is((select count(*)::integer from public.workspace_meetings
  where id = (select m3 from mwb_ids)), 1, 'deleting a board keeps the meeting');
insert into private.meet_whiteboards (meeting_id, whiteboard_id, ws_id)
select m3, b3, ws from mwb_ids;
delete from public.workspace_meetings where id = (select m3 from mwb_ids);
select is((select count(*)::integer from private.meet_whiteboards
  where meeting_id = (select m3 from mwb_ids)), 0, 'deleting a meeting removes its links');
select is((select count(*)::integer from public.workspace_whiteboards
  where id = (select b3 from mwb_ids)), 1, 'deleting a meeting keeps the board and its content');
reset role;

select * from finish();
rollback;
