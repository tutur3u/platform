begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data)
values
  ('00000000-0000-4000-8000-000000009601', 'meet-host@TUTURUUU.COM', now(), '{}'::jsonb),
  ('00000000-0000-4000-8000-000000009602', 'meet-external@example.com', now(), '{}'::jsonb),
  ('00000000-0000-4000-8000-000000009603', 'meet-host@tuturuuu.com.evil.test', now(), '{}'::jsonb);

insert into auth.identities (id, provider_id, user_id, identity_data, provider)
select gen_random_uuid(), id::text, id, jsonb_build_object('sub', id::text, 'email', email), 'email'
from auth.users where id in (
  '00000000-0000-4000-8000-000000009601',
  '00000000-0000-4000-8000-000000009602',
  '00000000-0000-4000-8000-000000009603'
);
insert into public.workspaces (id, name, personal, creator_id)
values ('00000000-0000-4000-8000-000000009611', 'Meet policy test', false, '00000000-0000-4000-8000-000000009601');
insert into public.workspace_members (ws_id, user_id, type)
values
  ('00000000-0000-4000-8000-000000009611', '00000000-0000-4000-8000-000000009601', 'MEMBER'),
  ('00000000-0000-4000-8000-000000009611', '00000000-0000-4000-8000-000000009602', 'MEMBER'),
  ('00000000-0000-4000-8000-000000009611', '00000000-0000-4000-8000-000000009603', 'MEMBER')
on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009601","role":"authenticated","email":"meet-host@TUTURUUU.COM"}', true);
select lives_ok($$insert into public.workspace_meetings (id, ws_id, creator_id, name, time) values ('00000000-0000-4000-8000-000000009621', '00000000-0000-4000-8000-000000009611', '00000000-0000-4000-8000-000000009601', 'Allowed', now())$$, 'Company member can create a meeting');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009602","role":"authenticated","email":"meet-external@example.com","user_metadata":{"email":"host@tuturuuu.com"}}', true);
select throws_ok($$insert into public.workspace_meetings (ws_id, creator_id, name, time) values ('00000000-0000-4000-8000-000000009611', '00000000-0000-4000-8000-000000009602', 'Denied', now())$$, '42501', null, 'External member cannot create via direct database access or metadata spoof');
select is((select count(*) from public.workspace_meetings where id = '00000000-0000-4000-8000-000000009621'), 1::bigint, 'External member can still read existing meetings');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009603","role":"authenticated","email":"meet-host@tuturuuu.com.evil.test"}', true);
select throws_ok($$insert into public.workspace_meetings (ws_id, creator_id, name, time) values ('00000000-0000-4000-8000-000000009611', '00000000-0000-4000-8000-000000009603', 'Denied', now())$$, '42501', null, 'Domain suffix spoof is rejected');
reset role;
select * from finish();
rollback;
