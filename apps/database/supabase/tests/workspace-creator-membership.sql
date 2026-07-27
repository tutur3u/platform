begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(13);

create temp table actors as
select
  '00000000-0000-0000-0000-000000000001'::uuid as creator,
  '00000000-0000-0000-0000-000000000002'::uuid as successor,
  '00000000-0000-0000-0000-000000000003'::uuid as joiner;

select ok(
  to_regprocedure('public.add_ws_creator()') is not null,
  'add_ws_creator() exists'
);

select ok(
  to_regprocedure('public.ensure_workspace_creator_membership()') is not null,
  'ensure_workspace_creator_membership() exists'
);

select ok(
  to_regprocedure('public.claim_workspace_creator_when_missing()') is null,
  'implicit creator claim function has been removed'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.workspaces'::regclass
      and tgname = 'workspaces_ensure_creator_membership'
      and not tgisinternal
  ),
  'creator membership trigger is attached to workspaces'
);

-- Service-role creation has no auth.uid(), so add_ws_creator() must use the
-- authoritative creator_id recorded on the workspace.
select set_config('request.jwt.claims', null, true);

insert into public.workspaces (id, name, personal, creator_id)
select
  '11111111-1111-1111-1111-111111111101',
  'pgtap-service-role',
  false,
  creator
from actors;

select is(
  (
    select type::text
    from public.workspace_members m, actors a
    where m.ws_id = '11111111-1111-1111-1111-111111111101'
      and m.user_id = a.creator
  ),
  'MEMBER',
  'service-role workspace creation adds the creator as a MEMBER'
);

-- A user-scoped insert must not produce a duplicate creator row.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select creator from actors),
    'role', 'authenticated'
  )::text,
  true
);

insert into public.workspaces (id, name, personal, creator_id)
select
  '11111111-1111-1111-1111-111111111102',
  'pgtap-user-scoped',
  false,
  creator
from actors;

select is(
  (
    select count(*)::int
    from public.workspace_members m
    where m.ws_id = '11111111-1111-1111-1111-111111111102'
  ),
  1,
  'user-scoped workspace creation adds the creator exactly once'
);

select set_config('request.jwt.claims', null, true);

-- A missing membership must not let a later member take ownership.
delete from public.workspace_members
where ws_id = '11111111-1111-1111-1111-111111111101';

insert into public.workspace_members (ws_id, user_id, type)
select
  '11111111-1111-1111-1111-111111111101',
  joiner,
  'MEMBER'
from actors;

select is(
  (
    select creator_id
    from public.workspaces
    where id = '11111111-1111-1111-1111-111111111101'
  ),
  (select creator from actors),
  'adding a member never replaces the authoritative creator'
);

-- Recreate the creator row so the demotion invariant can be exercised.
insert into public.workspace_members (ws_id, user_id, type)
select
  '11111111-1111-1111-1111-111111111101',
  creator,
  'MEMBER'
from actors;

select set_config(
  'request.jwt.claims',
  json_build_object('role', 'service_role')::text,
  true
);

select throws_ok(
  $$
    update public.workspace_members
    set type = 'GUEST'
    where ws_id = '11111111-1111-1111-1111-111111111101'
      and user_id = '00000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'Workspace creator must remain a MEMBER',
  'the current creator cannot be demoted'
);

-- A pre-existing GUEST becomes a MEMBER when ownership is explicitly
-- transferred to them.
insert into public.workspace_members (ws_id, user_id, type)
select
  '11111111-1111-1111-1111-111111111101',
  successor,
  'GUEST'
from actors;

update public.workspaces
set creator_id = (select successor from actors)
where id = '11111111-1111-1111-1111-111111111101';

select is(
  (
    select type::text
    from public.workspace_members m, actors a
    where m.ws_id = '11111111-1111-1111-1111-111111111101'
      and m.user_id = a.successor
  ),
  'MEMBER',
  'an explicitly transferred creator is normalized to MEMBER'
);

select lives_ok(
  $$
    update public.workspace_members
    set type = 'GUEST'
    where ws_id = '11111111-1111-1111-1111-111111111101'
      and user_id = '00000000-0000-0000-0000-000000000001'
  $$,
  'the former creator can be demoted after ownership transfer'
);

select is(
  (
    select type::text
    from public.workspace_members m, actors a
    where m.ws_id = '11111111-1111-1111-1111-111111111101'
      and m.user_id = a.creator
  ),
  'GUEST',
  'the former creator membership update is persisted'
);

select throws_ok(
  $$
    update public.workspace_members
    set type = 'GUEST'
    where ws_id = '11111111-1111-1111-1111-111111111101'
      and user_id = '00000000-0000-0000-0000-000000000002'
  $$,
  '42501',
  'Workspace creator must remain a MEMBER',
  'the transferred creator receives the same demotion protection'
);

select is(
  (
    select creator_id
    from public.workspaces
    where id = '11111111-1111-1111-1111-111111111101'
  ),
  (select successor from actors),
  'ownership changes only through the explicit creator_id transfer'
);

select * from finish();

rollback;
