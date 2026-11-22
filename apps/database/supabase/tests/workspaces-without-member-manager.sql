begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local request.jwt.claims = '{"role":"service_role"}';
select no_plan();

select ok(
  p.prosecdef
    and p.provolatile = 's'
    and p.proconfig = array['search_path=pg_catalog, pg_temp']
    and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
    and not has_function_privilege('anon', p.oid, 'execute')
    and not has_function_privilege('authenticated', p.oid, 'execute')
    and has_function_privilege('service_role', p.oid, 'execute'),
  'the report is a stable service-only definer with a pinned search path'
)
from (values ('private.list_workspaces_without_member_manager(uuid,integer)')) f(signature)
left join pg_proc p on p.oid = to_regprocedure(f.signature);

select gen_random_uuid() as owner, gen_random_uuid() as member, gen_random_uuid() as guest,
  'ffffffff-ffff-ffff-ffff-000000000000'::uuid as page_start,
  'ffffffff-ffff-ffff-ffff-000000000001'::uuid as first_ws,
  'ffffffff-ffff-ffff-ffff-000000000100'::uuid as first_page_end,
  'ffffffff-ffff-ffff-ffff-000000000103'::uuid as page_end,
  'ffffffff-ffff-ffff-ffff-000000000104'::uuid as managed_ws,
  'ffffffff-ffff-ffff-ffff-000000000105'::uuid as guests_ws,
  'ffffffff-ffff-ffff-ffff-000000000106'::uuid as empty_ws
\gset

insert into auth.users (id, email)
select id, id || '@example.test'
from unnest(array[:'owner', :'member', :'guest']::uuid[]) f(id);

create temp table workspaces_report_fixture (number int primary key, ws_id uuid unique);
insert into workspaces_report_fixture
select n, ('ffffffff-ffff-ffff-ffff-' || lpad(n::text, 12, '0'))::uuid
from generate_series(1, 106) f(n);

insert into public.workspaces (id, name, creator_id, personal, created_at)
select ws_id, 'Workspace manager report ' || number, :'owner', false, '2026-11-22 00:00:00+00'
from workspaces_report_fixture;

delete from public.workspace_members wm
using workspaces_report_fixture f
where wm.ws_id = f.ws_id and wm.user_id = :'owner' and f.ws_id <> :'managed_ws';

insert into public.workspace_members (ws_id, user_id, type)
select ws_id, :'member', 'MEMBER' from workspaces_report_fixture
where number <= 103;

insert into public.workspace_members (ws_id, user_id, type) values
  (:'first_ws', :'guest', 'GUEST'),
  (:'guests_ws', :'guest', 'GUEST');

select results_eq(
  format('select * from private.list_workspaces_without_member_manager(%L, 1)', :'page_start'),
  format('values (%L::uuid, %L::text, %L::uuid, 1::bigint, %L::timestamptz)',
    :'first_ws', 'Workspace manager report 1', :'owner', '2026-11-22 00:00:00+00'),
  'the report exposes only the workspace details and the full-member count'
);

select ok(private.workspace_has_member_manager(:'managed_ws'),
  'the excluded shared workspace has a member manager');
select is((select count(*) from private.list_workspaces_without_member_manager(:'page_end', 100)
    where ws_id = :'managed_ws'), 0::bigint, 'a managed workspace is omitted');
select is((select count(*) from private.list_workspaces_without_member_manager(:'page_end', 100)
    where ws_id = :'guests_ws'), 0::bigint, 'a workspace containing only guests is omitted');
select is((select count(*) from private.list_workspaces_without_member_manager(:'page_end', 100)
    where ws_id = :'empty_ws'), 0::bigint, 'an empty workspace is omitted');

select w.id as personal_ws from public.workspaces w
where w.personal and w.creator_id = :'owner'
\gset

delete from public.workspace_members where ws_id = :'personal_ws';
insert into public.workspace_members (ws_id, user_id, type)
values (:'personal_ws', :'member', 'MEMBER');

select ok(not private.workspace_has_member_manager(:'personal_ws')
  and exists (select 1 from public.workspace_members
    where ws_id = :'personal_ws' and type = 'MEMBER'),
  'the personal-workspace fixture otherwise matches the orphan criteria');
select is((select count(*)
  from private.list_workspaces_without_member_manager(
    (select w.id from public.workspaces w where w.id < :'personal_ws' order by w.id desc limit 1),
    1
  ) where ws_id = :'personal_ws'
), 0::bigint, 'a personal workspace without a member manager is omitted');

select is((select count(*) from private.list_workspaces_without_member_manager(:'page_start', 10000)),
  100::bigint, 'large requested pages are capped at 100 rows');
select is((select count(*) from private.list_workspaces_without_member_manager(:'page_start')),
  50::bigint, 'the default page contains 50 rows');
select is((select ws_id from private.list_workspaces_without_member_manager(:'page_start', 10000) offset 99),
  :'first_page_end'::uuid, 'the capped page ends at the expected UUID');
select results_eq(
  format('select ws_id from private.list_workspaces_without_member_manager(%L, 10000)', :'first_page_end'),
  'select ws_id from workspaces_report_fixture where number between 101 and 103 order by ws_id',
  'the next page starts strictly after the cursor and skips ineligible workspaces'
);

select * from finish();
rollback;
