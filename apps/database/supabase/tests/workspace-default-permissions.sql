begin;

select plan(14);

select has_column(
  'public',
  'workspace_default_permissions',
  'member_type',
  'workspace_default_permissions has member_type'
);

select col_type_is(
  'public',
  'workspace_default_permissions',
  'member_type',
  'workspace_member_type',
  'workspace_default_permissions.member_type uses workspace_member_type'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_default_permissions'
      and column_name = 'member_type'
  ),
  'NO',
  'workspace_default_permissions.member_type is not nullable'
);

select ok(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_default_permissions'
      and column_name = 'member_type'
  ) = '''MEMBER''::workspace_member_type',
  'workspace_default_permissions.member_type defaults to MEMBER'
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.workspace_default_permissions'::regclass
      and c.contype = 'p'::"char"
      and c.conkey = array[1, 2, 5]::smallint[]
  ) then
    raise exception 'workspace_default_permissions primary key does not include member_type';
  end if;
end $$;

select pass('workspace_default_permissions primary key includes member_type');

do $$
begin
  if to_regclass('public.workspace_default_permissions_ws_member_type_idx') is null then
    raise exception 'workspace_default_permissions ws_id/member_type index is missing';
  end if;
end $$;

select pass('workspace_default_permissions has a ws_id/member_type lookup index');

do $$
begin
  if obj_description('public.workspace_default_permissions'::regclass, 'pg_class') is null then
    raise exception 'workspace_default_permissions table comment is missing';
  end if;
end $$;

select pass('workspace_default_permissions has a table comment for typed defaults');

insert into public.users (id)
values
  ('00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000902'),
  ('00000000-0000-0000-0000-000000000903')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-000000000910',
  'Typed Defaults Test Workspace',
  false,
  '00000000-0000-0000-0000-000000000901'
)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values
  (
    '00000000-0000-0000-0000-000000000910',
    '00000000-0000-0000-0000-000000000901',
    'MEMBER'
  ),
  (
    '00000000-0000-0000-0000-000000000910',
    '00000000-0000-0000-0000-000000000903',
    'MEMBER'
  ),
  (
    '00000000-0000-0000-0000-000000000910',
    '00000000-0000-0000-0000-000000000902',
    'GUEST'
  )
on conflict (ws_id, user_id) do update
set type = excluded.type;

update public.workspace_default_permissions
set enabled = false
where ws_id = '00000000-0000-0000-0000-000000000910'
  and permission = 'admin'
  and member_type = 'MEMBER';

select lives_ok(
  $$
    insert into public.workspace_default_permissions
      (ws_id, permission, member_type, enabled)
    values
      (
        '00000000-0000-0000-0000-000000000910',
        'manage_calendar',
        'MEMBER',
        false
      ),
      (
        '00000000-0000-0000-0000-000000000910',
        'manage_calendar',
        'GUEST',
        true
      ),
      (
        '00000000-0000-0000-0000-000000000910',
        'manage_projects',
        'MEMBER',
        true
      ),
      (
        '00000000-0000-0000-0000-000000000910',
        'manage_projects',
        'GUEST',
        false
      )
    on conflict (ws_id, permission, member_type)
    do update set enabled = excluded.enabled
  $$,
  'member and guest defaults can coexist for the same permission'
);

select ok(
  (
    select jsonb_agg(member_type::text order by member_type::text)
    from public.workspace_default_permissions
    where ws_id = '00000000-0000-0000-0000-000000000910'
      and permission = 'manage_calendar'
  ) = '["GUEST", "MEMBER"]'::jsonb,
  'workspace_default_permissions stores both member types for one permission'
);

select is(
  public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000910',
    '00000000-0000-0000-0000-000000000903',
    'manage_calendar'
  ),
  false,
  'member permission checks ignore enabled guest defaults'
);

select is(
  public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000910',
    '00000000-0000-0000-0000-000000000903',
    'manage_projects'
  ),
  true,
  'member permission checks read enabled member defaults'
);

select is(
  public.is_org_member(
    '00000000-0000-0000-0000-000000000903',
    '00000000-0000-0000-0000-000000000910'
  ),
  true,
  'is_org_member returns true for MEMBER rows'
);

select is(
  public.is_org_member(
    '00000000-0000-0000-0000-000000000902',
    '00000000-0000-0000-0000-000000000910'
  ),
  false,
  'is_org_member returns false for GUEST rows'
);

select is(
  public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000910',
    '00000000-0000-0000-0000-000000000902',
    'manage_calendar'
  ),
  false,
  'guest defaults do not leak into member permission functions'
);

select * from finish();

rollback;
