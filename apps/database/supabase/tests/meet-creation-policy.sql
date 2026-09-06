begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);
insert into public.users (id) values ('00000000-0000-4000-8000-000000009601');
insert into public.workspaces (id, name, personal, creator_id)
values ('00000000-0000-4000-8000-000000009611', 'Meet policy test', false, '00000000-0000-4000-8000-000000009601');
insert into public.workspace_members (ws_id, user_id, type)
values ('00000000-0000-4000-8000-000000009611', '00000000-0000-4000-8000-000000009601', 'MEMBER') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009601","role":"authenticated","email":"host@TUTURUUU.COM"}', true);
select lives_ok($$insert into public.workspace_meetings (id, ws_id, creator_id, name, time) values ('00000000-0000-4000-8000-000000009621', '00000000-0000-4000-8000-000000009611', '00000000-0000-4000-8000-000000009601', 'Allowed', now())$$, 'Company member can create a meeting');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009601","role":"authenticated","email":"external@example.com","user_metadata":{"email":"host@tuturuuu.com"}}', true);
select throws_ok($$insert into public.workspace_meetings (ws_id, creator_id, name, time) values ('00000000-0000-4000-8000-000000009611', '00000000-0000-4000-8000-000000009601', 'Denied', now())$$, '42501', null, 'External member cannot create via direct database access or metadata spoof');
select is((select count(*) from public.workspace_meetings where id = '00000000-0000-4000-8000-000000009621'), 1::bigint, 'External member can still read existing meetings');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000009601","role":"authenticated","email":"host@tuturuuu.com.evil.test"}', true);
select throws_ok($$insert into public.workspace_meetings (ws_id, creator_id, name, time) values ('00000000-0000-4000-8000-000000009611', '00000000-0000-4000-8000-000000009601', 'Denied', now())$$, '42501', null, 'Domain suffix spoof is rejected');
reset role;
select * from finish();
rollback;
