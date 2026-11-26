begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);

select ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated')) as role(name)
    cross join (values ('private.upskii_live_class_grants'), ('private.upskii_live_class_rooms')) as tbl(name)
    where has_table_privilege(role.name, tbl.name, 'select, insert, update, delete, truncate, references, trigger')
  ),
  'client roles have no privileges on either private table'
);
select ok(
  (select count(*) = 2 from pg_class
   where oid in ('private.upskii_live_class_grants'::regclass, 'private.upskii_live_class_rooms'::regclass)
   and relrowsecurity),
  'both tables enable RLS'
);
select ok(
  not has_function_privilege('anon', 'public.open_upskii_live_class_room(text,uuid,text,uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.open_upskii_live_class_room(text,uuid,text,uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.open_upskii_live_class_room(text,uuid,text,uuid,uuid,text)', 'execute'),
  'only the service role can call the initializer'
);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data)
values
  ('00000000-0000-4000-8000-000000009711', 'live-class-one@example.com', now(), '{}'::jsonb),
  ('00000000-0000-4000-8000-000000009712', 'live-class-two@example.com', now(), '{}'::jsonb);
insert into public.workspaces (id, name, personal, creator_id)
select ws.id, 'Live class test', true, ws.owner_id
from (values
  ('00000000-0000-4000-8000-000000009721'::uuid, '00000000-0000-4000-8000-000000009711'::uuid),
  ('00000000-0000-4000-8000-000000009722'::uuid, '00000000-0000-4000-8000-000000009712'::uuid)
) as ws(id, owner_id)
where not exists (select from public.workspaces where personal is true and creator_id = ws.owner_id);
insert into public.workspace_members (ws_id, user_id, type)
select id, creator_id, 'MEMBER' from public.workspaces where personal is true
and creator_id in ('00000000-0000-4000-8000-000000009711', '00000000-0000-4000-8000-000000009712')
on conflict do nothing;

insert into private.external_account_links (id, provider, external_subject, user_id)
values
  ('00000000-0000-4000-8000-000000009731', 'upskii', 'live-class-teacher-1', '00000000-0000-4000-8000-000000009711'),
  ('00000000-0000-4000-8000-000000009732', 'upskii', 'live-class-teacher-2', '00000000-0000-4000-8000-000000009712');

set local role anon;
select throws_ok('select * from private.upskii_live_class_rooms', '42501', null, 'anon cannot read room mappings');
select throws_ok('select * from private.upskii_live_class_grants', '42501', null, 'anon cannot read grants');
reset role;
set local role authenticated;
select throws_ok('select * from private.upskii_live_class_rooms', '42501', null, 'authenticated cannot read room mappings');
select throws_ok('select * from private.upskii_live_class_grants', '42501', null, 'authenticated cannot read grants');
reset role;

set local role service_role;
select is(
  public.open_upskii_live_class_room(
    's4-test-class', '00000000-0000-4000-8000-000000009731', 'live-class-teacher-1',
    '00000000-0000-4000-8000-000000009711',
    (select id from public.workspaces where personal is true and creator_id = '00000000-0000-4000-8000-000000009711'),
    'Live class'
  )->>'kind', 'denied', 'an active E3 link alone cannot create a room'
);
insert into private.upskii_live_class_grants (link_id) values
  ('00000000-0000-4000-8000-000000009731'), ('00000000-0000-4000-8000-000000009732');

select is(
  public.open_upskii_live_class_room(
    's4-test-class', '00000000-0000-4000-8000-000000009731', 'wrong-subject',
    '00000000-0000-4000-8000-000000009711',
    (select id from public.workspaces where personal is true and creator_id = '00000000-0000-4000-8000-000000009711'),
    'Live class'
  )->>'kind', 'denied', 'grant is bound to the exact linked Upskii subject'
);

select public.open_upskii_live_class_room(
  's4-test-class', '00000000-0000-4000-8000-000000009731', 'live-class-teacher-1',
  '00000000-0000-4000-8000-000000009711',
  (select id from public.workspaces where personal is true and creator_id = '00000000-0000-4000-8000-000000009711'),
  'Live class'
)->>'meetingId' as meeting_id \gset
select isnt(:'meeting_id', null, 'a granted teacher opens a canonical room');
select is(
  public.open_upskii_live_class_room(
    's4-test-class', '00000000-0000-4000-8000-000000009731', 'live-class-teacher-1',
    '00000000-0000-4000-8000-000000009711',
    (select id from public.workspaces where personal is true and creator_id = '00000000-0000-4000-8000-000000009711'),
    'Updated title'
  )->>'meetingId', :'meeting_id', 'repeat open returns the same meeting'
);
select is(
  public.open_upskii_live_class_room(
    's4-test-class', '00000000-0000-4000-8000-000000009732', 'live-class-teacher-2',
    '00000000-0000-4000-8000-000000009712',
    (select id from public.workspaces where personal is true and creator_id = '00000000-0000-4000-8000-000000009712'),
    'Other teacher'
  )->>'kind', 'conflict', 'a second teacher cannot replace or open the original room'
);

delete from private.upskii_live_class_grants where link_id = '00000000-0000-4000-8000-000000009731';
select is(
  public.open_upskii_live_class_room(
    's4-test-class', '00000000-0000-4000-8000-000000009731', 'live-class-teacher-1',
    '00000000-0000-4000-8000-000000009711',
    (select id from public.workspaces where personal is true and creator_id = '00000000-0000-4000-8000-000000009711'),
    'Live class'
  )->>'kind', 'denied', 'revoking consent blocks reuse'
);
insert into private.upskii_live_class_grants (link_id)
values ('00000000-0000-4000-8000-000000009731');
update private.external_account_links set revoked_at = now(), revoked_by = 'user'
where id = '00000000-0000-4000-8000-000000009731';
select is(
  public.open_upskii_live_class_room(
    's4-test-class', '00000000-0000-4000-8000-000000009731', 'live-class-teacher-1',
    '00000000-0000-4000-8000-000000009711',
    (select id from public.workspaces where personal is true and creator_id = '00000000-0000-4000-8000-000000009711'),
    'Live class'
  )->>'kind', 'denied', 'revoking E3 blocks reuse even if a separate grant row remains'
);
reset role;

select * from finish();
rollback;
