begin;

select plan(15);

insert into auth.users (id) values
  ('20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');
insert into public.workspaces (id, name, personal, creator_id)
  values
    ('20000000-0000-4000-8000-000000000003', 'Grant recipient', false, '20000000-0000-4000-8000-000000000002'),
    ('00000000-0000-0000-0000-000000000000', 'Root fixture', false, '20000000-0000-4000-8000-000000000001')
  on conflict (id) do nothing;
insert into public.workspace_members (ws_id, user_id, type)
  values ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001', 'MEMBER')
  on conflict do nothing;
insert into public.workspace_roles (id, ws_id, name)
  values ('20000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'Review grant admin test');
insert into public.workspace_role_members (role_id, user_id)
  values ('20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001');
insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled)
  values ('20000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'admin', true);

insert into private.workspace_review_plan_grants
  (id, ws_id, tier, created_by, reason, created_at, expires_at)
  values ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003',
    'PRO', '20000000-0000-4000-8000-000000000001', 'Expired fixture', now() - interval '2 days', now() - interval '1 day');

select ok(
  not has_table_privilege('authenticated', 'private.workspace_review_plan_grants', 'select')
    and not has_table_privilege('service_role', 'private.workspace_review_plan_grants', 'update'),
  'grant audit is private and service writes must use the RPCs'
);
select ok(not has_function_privilege('authenticated',
  'public.create_workspace_review_plan_grant(uuid,uuid,uuid,public.workspace_product_tier,text,timestamptz)', 'execute'),
  'authenticated clients cannot call grant directly');

select ok(
  not has_function_privilege('anon', 'public._resolve_workspace_tier(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public._resolve_workspace_tier(uuid)', 'execute'),
  'client roles cannot enumerate effective tiers'
);

select ok(
  not has_function_privilege('service_role',
    'private.can_manage_workspace_review_plan_grants(uuid)', 'execute'),
  'the permission helper is callable only by the owning grant routines'
);

set local role service_role;

select is(public._resolve_workspace_tier('20000000-0000-4000-8000-000000000003')::text, 'FREE', 'expired grant does not admit');
select throws_ok($sql$
  select public.create_workspace_review_plan_grant(
    '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000006', 'PLUS', 'Unauthorized fixture', now() + interval '1 day'
  )
$sql$, '42501', 'Root administrator required', 'non-admin cannot grant even through the service RPC');

select lives_ok($sql$
  select public.create_workspace_review_plan_grant(
    '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000006', 'PLUS', 'Store review fixture', now() + interval '1 day'
  )
$sql$, 'root admin may grant Plus');
select is(public._resolve_workspace_tier('20000000-0000-4000-8000-000000000003')::text, 'PLUS', 'active grant resolves as a paid tier');
select is(public._resolve_workspace_tier('00000000-0000-0000-0000-000000000000')::text, 'FREE', 'grant is workspace-scoped');
select is(public.create_workspace_review_plan_grant(
    '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000006', 'PLUS', 'Store review fixture', now() + interval '1 day'
  ), '20000000-0000-4000-8000-000000000006'::uuid, 'identical retry returns the original grant');
select is(public.revoke_workspace_review_plan_grant(
    '20000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000006'
  ), false, 'revoke requires the matching workspace');
select is(public.revoke_workspace_review_plan_grant(
    '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000006'
  ), true, 'revoke records the audited state change');
select is(public._resolve_workspace_tier('20000000-0000-4000-8000-000000000003')::text, 'FREE', 'revocation takes effect on the next check');
select throws_ok($sql$
  select public.create_workspace_review_plan_grant(
    '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000006', 'PLUS', 'Store review fixture', now() + interval '1 day'
  )
$sql$, '22023', 'Workspace unavailable', 'replaying a revoked grant does not report success');
select ok(exists (
  select 1 from private.workspace_review_plan_grants
  where id = '20000000-0000-4000-8000-000000000006'
    and reason = 'Store review fixture'
    and created_by = '20000000-0000-4000-8000-000000000001'
    and revoked_by = created_by and revoked_at is not null
), 'audit preserves grant and revoke provenance');

reset role;
select * from finish();
rollback;
