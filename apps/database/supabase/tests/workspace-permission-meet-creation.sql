-- Assertion-level replay of meeting creation with a real Auth identity.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values ('9c7302b3-0000-4000-8000-000000009601','host@tuturuuu.com',now(),'{}'::jsonb);
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
values (gen_random_uuid(),'hwp-meet-host','9c7302b3-0000-4000-8000-000000009601',
  '{"sub":"hwp-meet-host","email":"host@tuturuuu.com"}'::jsonb,'email');
insert into public.users (id) values ('9c7302b3-0000-4000-8000-000000009601') on conflict do nothing;
insert into public.workspaces (id, name, personal, creator_id)
values ('9c7302b3-0000-4000-8000-000000009611', 'Meet policy test', false, '9c7302b3-0000-4000-8000-000000009601');
insert into public.workspace_members (ws_id, user_id, type)
values ('9c7302b3-0000-4000-8000-000000009611', '9c7302b3-0000-4000-8000-000000009601', 'MEMBER') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"9c7302b3-0000-4000-8000-000000009601","role":"authenticated","aal":"aal2","email":"host@TUTURUUU.COM"}', true);
select lives_ok($$insert into public.workspace_meetings (id, ws_id, creator_id, name, time) values ('9c7302b3-0000-4000-8000-000000009621', '9c7302b3-0000-4000-8000-000000009611', '9c7302b3-0000-4000-8000-000000009601', 'Allowed', now())$$, 'Company member can create a meeting');
reset role;
update auth.users set email='external@example.com' where id='9c7302b3-0000-4000-8000-000000009601';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"9c7302b3-0000-4000-8000-000000009601","role":"authenticated","aal":"aal2","email":"external@example.com","user_metadata":{"email":"host@tuturuuu.com"}}', true);
select throws_ok($$insert into public.workspace_meetings (ws_id, creator_id, name, time) values ('9c7302b3-0000-4000-8000-000000009611', '9c7302b3-0000-4000-8000-000000009601', 'Denied', now())$$, '42501', null, 'External member cannot create via direct database access or metadata spoof');
select is((select count(*) from public.workspace_meetings where id = '9c7302b3-0000-4000-8000-000000009621'), 1::bigint, 'External member can still read existing meetings');
reset role;
update auth.users set email='host@tuturuuu.com.evil.test' where id='9c7302b3-0000-4000-8000-000000009601';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"9c7302b3-0000-4000-8000-000000009601","role":"authenticated","aal":"aal2","email":"host@tuturuuu.com.evil.test"}', true);
select throws_ok($$insert into public.workspace_meetings (ws_id, creator_id, name, time) values ('9c7302b3-0000-4000-8000-000000009611', '9c7302b3-0000-4000-8000-000000009601', 'Denied', now())$$, '42501', null, 'Domain suffix spoof is rejected');
reset role;
update auth.users set email='host@tuturuuu.com' where id='9c7302b3-0000-4000-8000-000000009601';
delete from auth.identities where user_id='9c7302b3-0000-4000-8000-000000009601';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"9c7302b3-0000-4000-8000-000000009601","role":"authenticated","aal":"aal2","email":"host@tuturuuu.com"}', true);
select throws_ok($$insert into public.workspace_meetings(ws_id,creator_id,name,time) values ('9c7302b3-0000-4000-8000-000000009611','9c7302b3-0000-4000-8000-000000009601','No identity',now())$$,'42501',null,'a company email without a provider identity cannot create a meeting');
reset role;
select * from finish();
rollback;
