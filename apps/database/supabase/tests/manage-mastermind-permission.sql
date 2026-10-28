-- manage_mastermind: added with no grants, never implied, granted only
-- through the audited private RPC. Product rule:
-- apps/docs/platform/features/mobile-mastermind.mdx#access-rule
begin;

select plan(24);

select ok(
  'manage_mastermind' = any(
    enum_range(null::public.workspace_role_permission)::text[]
  ),
  'workspace_role_permission includes manage_mastermind'
);

-- Post-migration state, before any fixture: nobody holds it.
select is(
  (select count(*) from public.workspace_role_permissions
   where permission::text = 'manage_mastermind'),
  0::bigint,
  'no role carries manage_mastermind after the migration'
);

select is(
  (select count(*) from public.workspace_default_permissions
   where permission::text = 'manage_mastermind'),
  0::bigint,
  'no default permission carries manage_mastermind after the migration'
);

select is(
  (
    select count(*)
    from (
      select ws_id, user_id from public.workspace_members
      union
      select id, creator_id from public.workspaces where creator_id is not null
    ) holders
    where public.has_workspace_permission(
      holders.ws_id, holders.user_id, 'manage_mastermind'
    )
  ),
  0::bigint,
  'no member or workspace creator holds manage_mastermind after the migration'
);

-- Fixtures.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('4d400000-0000-4000-8000-000000000001', 'mm-target@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('4d400000-0000-4000-8000-000000000002', 'mm-root-admin@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('4d400000-0000-4000-8000-000000000003', 'mm-outsider@example.com', now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values ('00000000-0000-0000-0000-000000000000', 'Root fixture', false, '4d400000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values ('4d400000-0000-4000-8000-0000000000a1', 'MM other workspace', false, '4d400000-0000-4000-8000-000000000001');

insert into public.workspace_members (ws_id, user_id, type)
values
  ('00000000-0000-0000-0000-000000000000', '4d400000-0000-4000-8000-000000000001', 'MEMBER'),
  ('00000000-0000-0000-0000-000000000000', '4d400000-0000-4000-8000-000000000002', 'MEMBER'),
  ('4d400000-0000-4000-8000-0000000000a1', '4d400000-0000-4000-8000-000000000001', 'MEMBER')
on conflict (ws_id, user_id) do update set type = 'MEMBER';

insert into public.workspace_roles (id, ws_id, name)
values
  ('4d400000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'MM root admins'),
  ('4d400000-0000-4000-8000-0000000000b2', '4d400000-0000-4000-8000-0000000000a1', 'MM other role');

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values ('00000000-0000-0000-0000-000000000000', '4d400000-0000-4000-8000-0000000000b1', 'admin', true);

insert into public.workspace_role_members (role_id, user_id)
values ('4d400000-0000-4000-8000-0000000000b1', '4d400000-0000-4000-8000-000000000002');

select ok(
  not public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000',
    '4d400000-0000-4000-8000-000000000002',
    'manage_mastermind'
  ),
  'a root admin does not inherit manage_mastermind'
);

select ok(
  public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000',
    '4d400000-0000-4000-8000-000000000002',
    'view_infrastructure'
  ),
  'admin still implies other root permissions'
);

-- Guards: no default grant, no grant outside the RPC, never outside root.
select throws_ok(
  $$insert into public.workspace_default_permissions (ws_id, member_type, permission, enabled)
    values ('00000000-0000-0000-0000-000000000000', 'MEMBER', 'manage_mastermind', true)$$,
  '42501',
  null,
  'manage_mastermind cannot be enabled as a default permission'
);

select lives_ok(
  $$insert into public.workspace_default_permissions (ws_id, member_type, permission, enabled)
    values ('00000000-0000-0000-0000-000000000000', 'MEMBER', 'manage_mastermind', false)$$,
  'a disabled default row (role editor upsert) is accepted'
);

select throws_ok(
  $$insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
    values ('00000000-0000-0000-0000-000000000000', '4d400000-0000-4000-8000-0000000000b1', 'manage_mastermind', true)$$,
  '42501',
  null,
  'a direct root role grant outside the RPC is rejected'
);

select lives_ok(
  $$insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
    values ('4d400000-0000-4000-8000-0000000000a1', '4d400000-0000-4000-8000-0000000000b2', 'manage_mastermind', false)$$,
  'a disabled role row in another workspace is accepted'
);

do $$ begin perform set_config('tuturuuu.mastermind_grant', 'audited', true); end $$;
select throws_ok(
  $$update public.workspace_role_permissions set enabled = true
    where role_id = '4d400000-0000-4000-8000-0000000000b2'
      and permission::text = 'manage_mastermind'$$,
  '42501',
  null,
  'manage_mastermind is never enabled outside the root workspace, even with the grant flag'
);
do $$ begin perform set_config('tuturuuu.mastermind_grant', '', true); end $$;

-- API roles cannot run the grant RPC.
select ok(
  not has_function_privilege('anon', 'private.grant_mastermind_access(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'private.grant_mastermind_access(uuid, text)', 'execute')
  and not has_function_privilege('service_role', 'private.grant_mastermind_access(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'private.revoke_mastermind_access(uuid, text)', 'execute')
  and not has_function_privilege('service_role', 'private.revoke_mastermind_access(uuid, text)', 'execute'),
  'grant and revoke RPCs are not executable by anon, authenticated or service_role'
);

select throws_ok(
  $$select private.grant_mastermind_access('4d400000-0000-4000-8000-000000000003', 'pgTAP outsider')$$,
  'P0001',
  'grant_mastermind_access: user is not a root workspace member',
  'the RPC refuses a user outside the root workspace'
);

select throws_ok(
  $$select private.grant_mastermind_access('4d400000-0000-4000-8000-000000000001', ' ')$$,
  'P0001',
  'grant_mastermind_access: a reason is required',
  'the RPC requires a reason'
);

-- Audited grant, twice: idempotent.
create temp table mm_grant_roles (role_id uuid);
insert into mm_grant_roles
select private.grant_mastermind_access('4d400000-0000-4000-8000-000000000001', 'pgTAP grant');
insert into mm_grant_roles
select private.grant_mastermind_access('4d400000-0000-4000-8000-000000000001', 'pgTAP grant again');

select is(
  (select count(distinct role_id) from mm_grant_roles),
  1::bigint,
  'repeated grants reuse one Mastermind role'
);

select is(
  (
    select count(*)
    from public.workspace_role_members wrm
    where wrm.role_id = (select distinct role_id from mm_grant_roles)
  ),
  1::bigint,
  'the Mastermind role has exactly one member after repeated grants'
);

select is(
  (
    select array_agg(changed order by id)
    from private.mastermind_access_audit
    where target_user_id = '4d400000-0000-4000-8000-000000000001'
      and action = 'grant'
  ),
  array[true, false],
  'both grants are audited and only the first changed anything'
);

select ok(
  public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000',
    '4d400000-0000-4000-8000-000000000001',
    'manage_mastermind'
  ),
  'the granted user holds manage_mastermind in root'
);

select ok(
  not public.has_workspace_permission(
    '4d400000-0000-4000-8000-0000000000a1',
    '4d400000-0000-4000-8000-000000000001',
    'manage_mastermind'
  ),
  'the grant does not apply in any other workspace, including one the user created'
);

select throws_ok(
  $$insert into public.workspace_role_members (role_id, user_id)
    select role_id, '4d400000-0000-4000-8000-000000000002' from mm_grant_roles limit 1$$,
  '42501',
  null,
  'adding a member to the Mastermind role outside the RPC is rejected'
);

select lives_ok(
  $$update public.workspace_role_permissions set enabled = true
    where ws_id = '00000000-0000-0000-0000-000000000000'
      and permission::text = 'manage_mastermind'
      and role_id in (select role_id from mm_grant_roles)$$,
  're-saving an unchanged grant (role editor upsert) is accepted'
);

select is(
  private.revoke_mastermind_access('4d400000-0000-4000-8000-000000000001', 'pgTAP revoke'),
  1,
  'revoke removes the membership'
);

select ok(
  not public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000',
    '4d400000-0000-4000-8000-000000000001',
    'manage_mastermind'
  ),
  'after revoke the user no longer holds manage_mastermind'
);

select is(
  (
    select count(*)
    from public.workspace_role_members wrm
    where wrm.role_id = '4d400000-0000-4000-8000-0000000000b2'
       or wrm.role_id = '4d400000-0000-4000-8000-0000000000b1'
  ),
  1::bigint,
  'revoke leaves roles whose manage_mastermind row is disabled or absent alone'
);

select * from finish();

rollback;
