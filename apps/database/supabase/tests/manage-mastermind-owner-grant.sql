-- Owner grant by email (migration 20261028092700): 0 matches skip, a
-- non-member skips, 1 root member is granted idempotently, more than 1 raises.
-- Product rule: apps/docs/platform/features/mobile-mastermind.mdx#rollout
begin;

select plan(12);

-- Local and CI databases have no owner account, so the migration was a no-op.
select is(
  (select count(*) from private.mastermind_access_audit),
  0::bigint,
  'the migration granted nothing where the owner account is absent'
);

select is(
  private.grant_mastermind_access_by_email(
    'phucvo@tuturuuu.com',
    'pgTAP re-run of the migration grant'
  ),
  0,
  're-running the migration grant without the account is a no-op'
);

select ok(
  not has_function_privilege('anon', 'private.grant_mastermind_access_by_email(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'private.grant_mastermind_access_by_email(text, text)', 'execute')
  and not has_function_privilege('service_role', 'private.grant_mastermind_access_by_email(text, text)', 'execute'),
  'the email grant is not executable by anon, authenticated or service_role'
);

-- Fixtures.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('4d410000-0000-4000-8000-000000000001', 'MM-Owner@Example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('4d410000-0000-4000-8000-000000000002', 'mm-dup@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('4d410000-0000-4000-8000-000000000003', 'MM-DUP@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('4d410000-0000-4000-8000-000000000004', 'mm-outsider@example.com', now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values ('00000000-0000-0000-0000-000000000000', 'Root fixture', false, '4d410000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values
  ('00000000-0000-0000-0000-000000000000', '4d410000-0000-4000-8000-000000000001', 'MEMBER'),
  ('00000000-0000-0000-0000-000000000000', '4d410000-0000-4000-8000-000000000002', 'MEMBER'),
  ('00000000-0000-0000-0000-000000000000', '4d410000-0000-4000-8000-000000000003', 'MEMBER')
on conflict (ws_id, user_id) do update set type = 'MEMBER';

select throws_ok(
  $$select private.grant_mastermind_access_by_email('mm-dup@example.com', 'pgTAP duplicate')$$,
  'P0001',
  'grant_mastermind_access_by_email: 2 accounts match mm-dup@example.com; refusing to grant',
  'more than one matching account aborts (fail closed)'
);

select is(
  private.grant_mastermind_access_by_email('mm-outsider@example.com', 'pgTAP outsider'),
  0,
  'an account outside the root workspace is skipped, not granted'
);

select is(
  (select count(*) from private.mastermind_access_audit),
  0::bigint,
  'skipped and refused grants write no audit row'
);

select is(
  private.grant_mastermind_access_by_email(' mm-owner@example.com ', 'pgTAP owner grant'),
  1,
  'one matching root member is granted, matching email case-insensitively'
);

select is(
  private.grant_mastermind_access_by_email('mm-owner@example.com', 'pgTAP owner grant again'),
  1,
  'a repeated grant keeps exactly one holder'
);

select ok(
  public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000',
    '4d410000-0000-4000-8000-000000000001',
    'manage_mastermind'
  ),
  'the matched owner holds manage_mastermind in root'
);

select is(
  (
    select count(*)
    from public.workspace_role_members wrm
    join public.workspace_role_permissions wrp on wrp.role_id = wrm.role_id
    where wrp.ws_id = '00000000-0000-0000-0000-000000000000'
      and wrp.permission::text = 'manage_mastermind'
      and wrp.enabled
  ),
  1::bigint,
  'the owner is the only member of a manage_mastermind role'
);

select is(
  (
    select array_agg(changed order by id)
    from private.mastermind_access_audit
    where target_user_id = '4d410000-0000-4000-8000-000000000001'
  ),
  array[true, false],
  'both grants are audited and only the first changed anything'
);

select throws_ok(
  $$select private.grant_mastermind_access_by_email(' ', 'pgTAP blank')$$,
  'P0001',
  'grant_mastermind_access_by_email: an email is required',
  'a blank email is rejected'
);

select * from finish();

rollback;
