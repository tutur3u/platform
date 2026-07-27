begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(9);

-- Two seeded users stand in for the creator and a later joiner.
create temp table actors as
select
  '00000000-0000-0000-0000-000000000001'::uuid as creator,
  '00000000-0000-0000-0000-000000000002'::uuid as joiner;

select ok(
  to_regprocedure('public.add_ws_creator()') is not null,
  'add_ws_creator() exists'
);

select ok(
  to_regprocedure('public.claim_workspace_creator_when_missing()') is not null,
  'claim_workspace_creator_when_missing() exists'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.workspace_members'::regclass
      and tgname = 'claim_workspace_creator_when_missing_tr'
      and not tgisinternal
  ),
  'creator-claim trigger is attached to workspace_members'
);

-- A service-role insert carries no JWT, so auth.uid() is NULL. This is how
-- satellite apps create workspaces, and it used to leave the creator out of the
-- member list entirely, which read as read-only access in their own workspace.
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
    select count(*)::int
    from public.workspace_members m, actors a
    where m.ws_id = '11111111-1111-1111-1111-111111111101'
      and m.user_id = a.creator
  ),
  1,
  'service-role workspace creation still adds the creator as a member'
);

-- A user-scoped insert resolves auth.uid(), and must not produce a second row.
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

-- Orphan state: a workspace whose recorded creator is not a member. Built by
-- removing the row the trigger adds, matching the rows the bug left behind.
insert into public.workspaces (id, name, personal, creator_id)
select
  '11111111-1111-1111-1111-111111111103',
  'pgtap-orphan-sole',
  false,
  creator
from actors;
delete from public.workspace_members
where ws_id = '11111111-1111-1111-1111-111111111103';

insert into public.workspace_members (ws_id, user_id, type)
select '11111111-1111-1111-1111-111111111103', joiner, 'MEMBER' from actors;

select is(
  (
    select creator_id
    from public.workspaces
    where id = '11111111-1111-1111-1111-111111111103'
  ),
  (select joiner from actors),
  'sole member of a creator-less workspace is adopted as its creator'
);

-- Once a workspace has a member, nobody who joins later can take it over. The
-- sole-member rule only ever fires for the first member of an orphaned
-- workspace; after that the workspace has an administrator and is settled.
insert into public.workspaces (id, name, personal, creator_id)
select
  '11111111-1111-1111-1111-111111111104',
  'pgtap-orphan-two',
  false,
  creator
from actors;
delete from public.workspace_members
where ws_id = '11111111-1111-1111-1111-111111111104';

insert into public.workspace_members (ws_id, user_id, type)
select '11111111-1111-1111-1111-111111111104', joiner, 'MEMBER' from actors;
insert into public.workspace_members (ws_id, user_id, type)
values (
  '11111111-1111-1111-1111-111111111104',
  '00000000-0000-0000-0000-000000000003',
  'MEMBER'
);

select is(
  (
    select creator_id
    from public.workspaces
    where id = '11111111-1111-1111-1111-111111111104'
  ),
  (select joiner from actors),
  'a later joiner cannot take over from the member who already claimed it'
);

-- A lone guest is not an administrator and must not inherit the workspace.
insert into public.workspaces (id, name, personal, creator_id)
select
  '11111111-1111-1111-1111-111111111105',
  'pgtap-orphan-guest',
  false,
  creator
from actors;
delete from public.workspace_members
where ws_id = '11111111-1111-1111-1111-111111111105';

insert into public.workspace_members (ws_id, user_id, type)
select '11111111-1111-1111-1111-111111111105', joiner, 'GUEST' from actors;

select is(
  (
    select creator_id
    from public.workspaces
    where id = '11111111-1111-1111-1111-111111111105'
  ),
  (select creator from actors),
  'a lone GUEST is never adopted as the workspace creator'
);

-- A healthy workspace keeps its creator when other people join.
insert into public.workspaces (id, name, personal, creator_id)
select
  '11111111-1111-1111-1111-111111111106',
  'pgtap-healthy',
  false,
  creator
from actors;

insert into public.workspace_members (ws_id, user_id, type)
select '11111111-1111-1111-1111-111111111106', joiner, 'MEMBER' from actors;

select is(
  (
    select creator_id
    from public.workspaces
    where id = '11111111-1111-1111-1111-111111111106'
  ),
  (select creator from actors),
  'a present creator is never demoted by a joining member'
);

select * from finish();

rollback;
