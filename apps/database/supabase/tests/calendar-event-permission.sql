begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

insert into public.users (id)
values
  ('00000000-0000-4000-8000-000000008601'),
  ('00000000-0000-4000-8000-000000008602'),
  ('00000000-0000-4000-8000-000000008603'),
  ('00000000-0000-4000-8000-000000008604')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values
  (
    '00000000-0000-4000-8000-000000008611',
    'Calendar Permission Workspace',
    false,
    '00000000-0000-4000-8000-000000008601'
  ),
  (
    '00000000-0000-4000-8000-000000008612',
    'Other Calendar Workspace',
    false,
    '00000000-0000-4000-8000-000000008603'
  )
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values
  (
    '00000000-0000-4000-8000-000000008611',
    '00000000-0000-4000-8000-000000008601',
    'MEMBER'
  ),
  (
    '00000000-0000-4000-8000-000000008611',
    '00000000-0000-4000-8000-000000008602',
    'MEMBER'
  ),
  (
    '00000000-0000-4000-8000-000000008611',
    '00000000-0000-4000-8000-000000008604',
    'MEMBER'
  ),
  (
    '00000000-0000-4000-8000-000000008612',
    '00000000-0000-4000-8000-000000008603',
    'MEMBER'
  )
on conflict (ws_id, user_id) do update set type = excluded.type;

insert into public.workspace_roles (id, ws_id, name)
values (
  '00000000-0000-4000-8000-000000008631',
  '00000000-0000-4000-8000-000000008611',
  'Calendar manager'
)
on conflict (id) do nothing;

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values (
  '00000000-0000-4000-8000-000000008611',
  '00000000-0000-4000-8000-000000008631',
  'manage_calendar',
  true
)
on conflict (ws_id, permission, role_id)
do update set enabled = excluded.enabled;

insert into public.workspace_role_members (role_id, user_id)
values (
  '00000000-0000-4000-8000-000000008631',
  '00000000-0000-4000-8000-000000008604'
)
on conflict (role_id, user_id) do nothing;

insert into public.workspace_calendar_events (
  id,
  ws_id,
  title,
  description,
  start_at,
  end_at
)
values (
  '00000000-0000-4000-8000-000000008621',
  '00000000-0000-4000-8000-000000008611',
  'Protected event',
  '',
  '2026-08-10 09:00:00+00',
  '2026-08-10 10:00:00+00'
);

select policies_are(
  'public',
  'workspace_calendar_events',
  array[
    'Calendar managers can delete workspace events',
    'Calendar managers can insert workspace events',
    'Calendar managers can select workspace events',
    'Calendar managers can update workspace events'
  ],
  'workspace events expose only operation-specific calendar manager policies'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000008604',
  true
);

select is(
  (select count(*) from public.workspace_calendar_events where id = '00000000-0000-4000-8000-000000008621'),
  1::bigint,
  'authorized calendar manager can select workspace events'
);

select lives_ok(
  $$insert into public.workspace_calendar_events (
      id, ws_id, title, description, start_at, end_at
    ) values (
      '00000000-0000-4000-8000-000000008622',
      '00000000-0000-4000-8000-000000008611',
      'Authorized event', '',
      '2026-08-10 11:00:00+00', '2026-08-10 12:00:00+00'
    )$$,
  'authorized calendar manager can insert workspace events'
);

select lives_ok(
  $$update public.workspace_calendar_events
    set title = 'Updated event'
    where id = '00000000-0000-4000-8000-000000008622'$$,
  'authorized calendar manager can update workspace events'
);

select lives_ok(
  $$delete from public.workspace_calendar_events
    where id = '00000000-0000-4000-8000-000000008622'$$,
  'authorized calendar manager can delete workspace events'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000008602',
  true
);

select is(
  (select count(*) from public.workspace_calendar_events where id = '00000000-0000-4000-8000-000000008621'),
  0::bigint,
  'workspace member without manage_calendar cannot select events'
);

select throws_ok(
  $$insert into public.workspace_calendar_events (
      ws_id, title, description, start_at, end_at
    ) values (
      '00000000-0000-4000-8000-000000008611', 'Denied event', '',
      '2026-08-10 13:00:00+00', '2026-08-10 14:00:00+00'
    )$$,
  '42501',
  null,
  'workspace member without manage_calendar cannot insert events'
);

select is(
  (with changed as (
    update public.workspace_calendar_events
    set title = 'Denied update'
    where id = '00000000-0000-4000-8000-000000008621'
    returning 1
  ) select count(*) from changed),
  0::bigint,
  'workspace member without manage_calendar cannot update events'
);

select is(
  (with removed as (
    delete from public.workspace_calendar_events
    where id = '00000000-0000-4000-8000-000000008621'
    returning 1
  ) select count(*) from removed),
  0::bigint,
  'workspace member without manage_calendar cannot delete events'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000008603',
  true
);

select is(
  (select count(*) from public.workspace_calendar_events where id = '00000000-0000-4000-8000-000000008621'),
  0::bigint,
  'calendar manager for another workspace cannot select target events'
);

select throws_ok(
  $$insert into public.workspace_calendar_events (
      ws_id, title, description, start_at, end_at
    ) values (
      '00000000-0000-4000-8000-000000008611', 'Cross-workspace event', '',
      '2026-08-10 15:00:00+00', '2026-08-10 16:00:00+00'
    )$$,
  '42501',
  null,
  'calendar manager for another workspace cannot insert target events'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(
  (select count(*) from public.workspace_calendar_events where id = '00000000-0000-4000-8000-000000008621'),
  0::bigint,
  'anonymous callers cannot select workspace events'
);

select throws_ok(
  $$insert into public.workspace_calendar_events (
      ws_id, title, description, start_at, end_at
    ) values (
      '00000000-0000-4000-8000-000000008611', 'Anonymous event', '',
      '2026-08-10 17:00:00+00', '2026-08-10 18:00:00+00'
    )$$,
  '42501',
  null,
  'anonymous callers cannot insert workspace events'
);

select * from finish();
rollback;
