begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(15);

insert into public.users (id)
values ('00000000-0000-0000-0000-000000010001')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id, timezone)
values (
  '00000000-0000-0000-0000-000000010010',
  'User Groups Table Test Workspace',
  false,
  '00000000-0000-0000-0000-000000010001',
  'Asia/Ho_Chi_Minh'
)
on conflict (id) do update
set timezone = excluded.timezone;

insert into public.workspaces (id, name, personal, creator_id, timezone)
values (
  '00000000-0000-0000-0000-000000010011',
  'User Groups Table UTC Fallback Workspace',
  false,
  '00000000-0000-0000-0000-000000010001',
  'auto'
)
on conflict (id) do update
set timezone = excluded.timezone;

insert into public.workspace_user_groups (
  id,
  ws_id,
  name,
  archived,
  sessions
)
values
  (
    '00000000-0000-0000-0000-000000010101',
    '00000000-0000-0000-0000-000000010010',
    'Zed No Session',
    false,
    array[(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date - 1]
  ),
  (
    '00000000-0000-0000-0000-000000010102',
    '00000000-0000-0000-0000-000000010010',
    'Lớp Cô Tuyết',
    false,
    array[(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date]
  ),
  (
    '00000000-0000-0000-0000-000000010103',
    '00000000-0000-0000-0000-000000010010',
    'Archived Session',
    true,
    array[(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date]
  )
on conflict (id) do update
set
  name = excluded.name,
  archived = excluded.archived,
  sessions = excluded.sessions;

select ok(
  to_regprocedure(
    'private.list_workspace_user_groups_for_table(uuid,text,text,uuid[],uuid[],integer,integer)'
  ) is not null,
  'private list helper exists'
);

select ok(
  to_regprocedure(
    'private.count_workspace_user_groups_for_table(uuid,text,text,uuid[],uuid[])'
  ) is not null,
  'private count helper exists'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use the private schema'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot use the private schema'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.list_workspace_user_groups_for_table(uuid,text,text,uuid[],uuid[],integer,integer)',
    'execute'
  ),
  'anon cannot execute the private list helper'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.list_workspace_user_groups_for_table(uuid,text,text,uuid[],uuid[],integer,integer)',
    'execute'
  ),
  'authenticated cannot execute the private list helper'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.count_workspace_user_groups_for_table(uuid,text,text,uuid[],uuid[])',
    'execute'
  ),
  'authenticated cannot execute the private count helper'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.list_workspace_user_groups_for_table(uuid,text,text,uuid[],uuid[],integer,integer)',
    'execute'
  ),
  'service role can execute the private list helper'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.count_workspace_user_groups_for_table(uuid,text,text,uuid[],uuid[])',
    'execute'
  ),
  'service role can execute the private count helper'
);

select is(
  private.resolve_user_groups_table_timezone(
    '00000000-0000-0000-0000-000000010011'
  ),
  'UTC',
  'auto workspace timezone falls back to UTC'
);

select results_eq(
  $$
    select name
    from private.list_workspace_user_groups_for_table(
      '00000000-0000-0000-0000-000000010010',
      'active',
      null,
      null,
      null,
      10,
      0
    )
  $$,
  $$
    values ('Lớp Cô Tuyết'::text), ('Zed No Session'::text)
  $$,
  'groups with sessions today sort first within active groups'
);

select results_eq(
  $$
    select name
    from private.list_workspace_user_groups_for_table(
      '00000000-0000-0000-0000-000000010010',
      'active',
      'tuyet',
      null,
      null,
      10,
      0
    )
  $$,
  $$ values ('Lớp Cô Tuyết'::text) $$,
  'accent-insensitive search matches Vietnamese group names'
);

select is(
  private.count_workspace_user_groups_for_table(
    '00000000-0000-0000-0000-000000010010',
    'active',
    null,
    null,
    null
  ),
  2,
  'active group count excludes archived groups'
);

select is(
  private.count_workspace_user_groups_for_table(
    '00000000-0000-0000-0000-000000010010',
    'all',
    null,
    null,
    null
  ),
  3,
  'all group count includes archived groups'
);

select results_eq(
  $$
    select name
    from private.list_workspace_user_groups_for_table(
      '00000000-0000-0000-0000-000000010010',
      'all',
      null,
      array['00000000-0000-0000-0000-000000010101']::uuid[],
      array['00000000-0000-0000-0000-000000010102']::uuid[],
      10,
      0
    )
  $$,
  $$ select null::text where false $$,
  'requested and accessible group filters must both match'
);

select * from finish();

rollback;
