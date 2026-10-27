begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(13);

-- Fixture: a workspace creator, a second member whose workspace profile link
-- is missing (the state the repair RPC exists to fix), and an outsider.
insert into auth.users (id) values
  ('00000000-0000-4000-8000-00000000c501'),
  ('00000000-0000-4000-8000-00000000c502'),
  ('00000000-0000-4000-8000-00000000c503');

insert into public.users (id, display_name) values
  ('00000000-0000-4000-8000-00000000c501', 'Link repair creator'),
  ('00000000-0000-4000-8000-00000000c502', 'Link repair member'),
  ('00000000-0000-4000-8000-00000000c503', 'Link repair outsider')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-4000-8000-00000000c511',
  'Link repair fixture',
  false,
  '00000000-0000-4000-8000-00000000c501'
);

insert into public.workspace_members (ws_id, user_id, type)
values (
  '00000000-0000-4000-8000-00000000c511',
  '00000000-0000-4000-8000-00000000c502',
  'MEMBER'
)
on conflict do nothing;

delete from public.workspace_user_linked_users
where ws_id = '00000000-0000-4000-8000-00000000c511'
  and platform_user_id = '00000000-0000-4000-8000-00000000c502';


select ok(
  not has_function_privilege(
    'anon',
    'public.consolidate_workspace_user_links(uuid)',
    'EXECUTE'
  ),
  'anon cannot execute consolidate_workspace_user_links'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.consolidate_workspace_user_links(uuid)',
    'EXECUTE'
  ),
  'authenticated callers must use the creator-gated API route'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.consolidate_workspace_user_links(uuid)',
    'EXECUTE'
  ),
  'service_role keeps execute for the creator-gated API route'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.consolidate_workspace_user_links(uuid)'::regprocedure
  ),
  array['search_path=pg_catalog, pg_temp'],
  'consolidate_workspace_user_links pins search_path'
);

-- Anonymous callers are rejected and must not write links.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  $$select * from public.consolidate_workspace_user_links('00000000-0000-4000-8000-00000000c511')$$,
  '42501',
  null,
  'anon call for a workspace is rejected'
);
select throws_ok(
  $$select * from public.consolidate_workspace_user_links(null)$$,
  '42501',
  null,
  'anon all-workspace sweep is rejected'
);
reset role;

select is(
  (
    select count(*)
    from public.workspace_user_linked_users
    where ws_id = '00000000-0000-4000-8000-00000000c511'
      and platform_user_id = '00000000-0000-4000-8000-00000000c502'
  ),
  0::bigint,
  'rejected anon calls create no workspace profile link'
);

-- Signed-in non-service callers are rejected, including the workspace creator
-- (who uses POST /api/v1/workspaces/[wsId]/consolidate-users instead).
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000c503"}',
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.consolidate_workspace_user_links('00000000-0000-4000-8000-00000000c511')$$,
  '42501',
  null,
  'authenticated outsider call is rejected'
);
reset role;

-- Defense in depth: even a role holding EXECUTE cannot run the repair for a
-- non-service request identity.
select throws_ok(
  $$select * from public.consolidate_workspace_user_links('00000000-0000-4000-8000-00000000c511')$$,
  '42501',
  null,
  'body rejects non-service request identities'
);
select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);
select throws_ok(
  $$select * from public.consolidate_workspace_user_links(null)$$,
  '42501',
  null,
  'body rejects anonymous request identities'
);

-- Legitimate path: the API route calls with the service-role admin client
-- after confirming the actor is the workspace creator.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(
  (
    select count(*)
    from public.consolidate_workspace_user_links('00000000-0000-4000-8000-00000000c511')
    where platform_user_id = '00000000-0000-4000-8000-00000000c502'
  ),
  1::bigint,
  'service_role repair restores the missing member link'
);
reset role;

select is(
  (
    select count(*)
    from public.workspace_user_linked_users
    where ws_id = '00000000-0000-4000-8000-00000000c511'
      and platform_user_id = '00000000-0000-4000-8000-00000000c502'
  ),
  1::bigint,
  'repaired member has exactly one workspace profile link'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(
  (
    select count(*)
    from public.consolidate_workspace_user_links('00000000-0000-4000-8000-00000000c511')
  ),
  0::bigint,
  'repeat service_role repair is idempotent'
);
reset role;

select * from finish();
rollback;
