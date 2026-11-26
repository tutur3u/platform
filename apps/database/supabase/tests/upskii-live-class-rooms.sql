begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

select ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated')) as role(name)
    cross join (values ('private.upskii_live_class_grants'), ('private.upskii_live_class_rooms'), ('private.upskii_live_class_releases')) as tbl(name)
    where has_table_privilege(role.name, tbl.name, 'select, insert, update, delete, truncate, references, trigger')
  ),
  'client roles have no privileges on the private tables'
);
select ok(
  (select count(*) = 3 from pg_class
   where oid in ('private.upskii_live_class_grants'::regclass, 'private.upskii_live_class_rooms'::regclass, 'private.upskii_live_class_releases'::regclass)
   and relrowsecurity),
  'all private tables enable RLS'
);
select ok(
  not has_function_privilege('anon', 'public.open_upskii_live_class_room(text,uuid,text,uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.open_upskii_live_class_room(text,uuid,text,uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.open_upskii_live_class_room(text,uuid,text,uuid,uuid,text)', 'execute'),
  'only the service role can call the initializer'
);

select ok(
  not has_function_privilege('anon', 'private.release_external_class_room(text,text)', 'execute')
  and not has_function_privilege('authenticated', 'private.release_external_class_room(text,text)', 'execute')
  and has_function_privilege('service_role', 'private.release_external_class_room(text,text)', 'execute'),
  'only the service role can release a room binding'
);

select set_config('request.jwt.claims', '{}', true);
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('e3a54000-0000-4000-8000-000000009711', 'live-class-one@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('e3a54000-0000-4000-8000-000000009712', 'live-class-two@example.com', now(), '{}'::jsonb, '{}'::jsonb);
-- Signup creates each teacher’s personal workspace and owner membership.
insert into private.external_account_links (id, provider, external_subject, user_id)
values
  ('e3a54000-0000-4000-8000-000000009731', 'upskii', 'live-class-teacher-1', 'e3a54000-0000-4000-8000-000000009711'),
  ('e3a54000-0000-4000-8000-000000009732', 'upskii', 'live-class-teacher-2', 'e3a54000-0000-4000-8000-000000009712');

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
    's4-test-class', 'e3a54000-0000-4000-8000-000000009731', 'live-class-teacher-1',
    'e3a54000-0000-4000-8000-000000009711',
    (select id from public.workspaces where personal is true and creator_id = 'e3a54000-0000-4000-8000-000000009711'),
    'Live class'
  )->>'kind', 'denied', 'an active E3 link alone cannot create a room'
);
insert into private.upskii_live_class_grants (link_id) values
  ('e3a54000-0000-4000-8000-000000009731'), ('e3a54000-0000-4000-8000-000000009732');

select is(
  public.open_upskii_live_class_room(
    's4-test-class', 'e3a54000-0000-4000-8000-000000009731', 'wrong-subject',
    'e3a54000-0000-4000-8000-000000009711',
    (select id from public.workspaces where personal is true and creator_id = 'e3a54000-0000-4000-8000-000000009711'),
    'Live class'
  )->>'kind', 'denied', 'grant is bound to the exact linked Upskii subject'
);

select public.open_upskii_live_class_room(
  's4-test-class', 'e3a54000-0000-4000-8000-000000009731', 'live-class-teacher-1',
  'e3a54000-0000-4000-8000-000000009711',
  (select id from public.workspaces where personal is true and creator_id = 'e3a54000-0000-4000-8000-000000009711'),
  'Live class'
)->>'meetingId' as meeting_id \gset
select isnt(:'meeting_id'::uuid, null::uuid, 'a granted teacher opens a canonical room');
select is(
  public.open_upskii_live_class_room(
    's4-test-class', 'e3a54000-0000-4000-8000-000000009731', 'live-class-teacher-1',
    'e3a54000-0000-4000-8000-000000009711',
    (select id from public.workspaces where personal is true and creator_id = 'e3a54000-0000-4000-8000-000000009711'),
    'Updated title'
  )->>'meetingId', :'meeting_id'::text, 'repeat open returns the same meeting'
);
select is(
  public.open_upskii_live_class_room(
    's4-test-class', 'e3a54000-0000-4000-8000-000000009732', 'live-class-teacher-2',
    'e3a54000-0000-4000-8000-000000009712',
    (select id from public.workspaces where personal is true and creator_id = 'e3a54000-0000-4000-8000-000000009712'),
    'Other teacher'
  )->>'kind', 'conflict', 'a second teacher cannot replace or open the original room'
);

delete from private.upskii_live_class_grants where link_id = 'e3a54000-0000-4000-8000-000000009731';
select is(
  public.open_upskii_live_class_room(
    's4-test-class', 'e3a54000-0000-4000-8000-000000009731', 'live-class-teacher-1',
    'e3a54000-0000-4000-8000-000000009711',
    (select id from public.workspaces where personal is true and creator_id = 'e3a54000-0000-4000-8000-000000009711'),
    'Live class'
  )->>'kind', 'denied', 'revoking consent blocks reuse'
);
insert into private.upskii_live_class_grants (link_id)
values ('e3a54000-0000-4000-8000-000000009731');
update private.external_account_links set revoked_at = now(), revoked_by = 'user'
where id = 'e3a54000-0000-4000-8000-000000009731';
select is(
  public.open_upskii_live_class_room(
    's4-test-class', 'e3a54000-0000-4000-8000-000000009731', 'live-class-teacher-1',
    'e3a54000-0000-4000-8000-000000009711',
    (select id from public.workspaces where personal is true and creator_id = 'e3a54000-0000-4000-8000-000000009711'),
    'Live class'
  )->>'kind', 'denied', 'revoking E3 blocks reuse even if a separate grant row remains'
);
select throws_ok(
  $$select private.release_external_class_room('s4-test-class', ' ')$$,
  '22023', null, 'release requires a reason'
);
select ok(
  private.release_external_class_room('s4-test-class', 'Correct workshop class binding'),
  'service role can release an existing binding'
);
select ok(
  not private.release_external_class_room('s4-test-class', 'Retry after success'),
  'repeating an already released mapping is a no-op'
);
select is(
  (select count(*) from private.upskii_live_class_releases
   where class_id = 's4-test-class' and meeting_id = :'meeting_id'::uuid
     and reason = 'Correct workshop class binding'),
  1::bigint, 'successful release records its class, room and reason'
);
select ok(
  not exists (select 1 from private.upskii_live_class_rooms where class_id = 's4-test-class')
  and exists (select 1 from public.workspace_meetings where id = :'meeting_id'::uuid),
  'service role can release the mapping while preserving the Meet room'
);
reset role;

select * from finish();
rollback;
