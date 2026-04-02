begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions, audit;

select plan(7);

insert into public.users (id)
values
  ('00000000-0000-0000-0000-000000000801'),
  ('00000000-0000-0000-0000-000000000802')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-000000000810',
  'Audit Actor Workspace',
  false,
  '00000000-0000-0000-0000-000000000801'
)
on conflict (id) do nothing;

select ok(
  audit.resolve_actor_auth_uid() is null,
  'audit.resolve_actor_auth_uid is null without an override in direct SQL sessions'
);

select is(
  (
    select (public.admin_create_workspace_user_with_audit_actor(
      '00000000-0000-0000-0000-000000000810',
      jsonb_build_object(
        'id', '00000000-0000-0000-0000-000000000820',
        'full_name', 'Actor Context User',
        'display_name', 'Actor Context User',
        'email', 'actor-context@example.com'
      ),
      '00000000-0000-0000-0000-000000000801'
    )).id
  ),
  '00000000-0000-0000-0000-000000000820'::uuid,
  'admin create RPC returns the created workspace user'
);

select is(
  (
    select auth_uid
    from audit.record_version
    where table_schema = 'public'
      and table_name = 'workspace_users'
      and op = 'INSERT'
      and record->>'id' = '00000000-0000-0000-0000-000000000820'
    order by id desc
    limit 1
  ),
  '00000000-0000-0000-0000-000000000801'::uuid,
  'admin create RPC preserves actor auth_uid in audit.record_version'
);

select is(
  (
    select (public.admin_update_workspace_user_with_audit_actor(
      '00000000-0000-0000-0000-000000000810',
      '00000000-0000-0000-0000-000000000820',
      jsonb_build_object(
        'archived', true,
        'archived_until', '2026-03-15T00:00:00Z'
      ),
      '00000000-0000-0000-0000-000000000802'
    )).archived
  ),
  true,
  'admin update RPC applies the requested patch'
);

select is(
  (
    select auth_uid
    from audit.record_version
    where table_schema = 'public'
      and table_name = 'workspace_users'
      and op = 'UPDATE'
      and record->>'id' = '00000000-0000-0000-0000-000000000820'
    order by id desc
    limit 1
  ),
  '00000000-0000-0000-0000-000000000802'::uuid,
  'admin update RPC preserves actor auth_uid in audit.record_version'
);

select is(
  (
    select (public.admin_delete_workspace_user_with_audit_actor(
      '00000000-0000-0000-0000-000000000810',
      '00000000-0000-0000-0000-000000000820',
      '00000000-0000-0000-0000-000000000801'
    )).id
  ),
  '00000000-0000-0000-0000-000000000820'::uuid,
  'admin delete RPC returns the deleted workspace user'
);

select is(
  (
    select auth_uid
    from audit.record_version
    where table_schema = 'public'
      and table_name = 'workspace_users'
      and op = 'DELETE'
      and old_record->>'id' = '00000000-0000-0000-0000-000000000820'
    order by id desc
    limit 1
  ),
  '00000000-0000-0000-0000-000000000801'::uuid,
  'admin delete RPC preserves actor auth_uid in audit.record_version'
);

select * from finish();

rollback;
