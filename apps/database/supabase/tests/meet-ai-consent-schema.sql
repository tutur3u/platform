begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select ok((select relrowsecurity from pg_class where oid = 'private.meet_ai_consents'::regclass), 'meet_ai_consents RLS enabled');
select ok(not has_table_privilege('anon', 'private.meet_ai_consents', 'SELECT'), 'anon cannot SELECT meet_ai_consents');
select ok(not has_table_privilege('anon', 'private.meet_ai_consents', 'INSERT'), 'anon cannot INSERT meet_ai_consents');
select ok(not has_table_privilege('anon', 'private.meet_ai_consents', 'UPDATE'), 'anon cannot UPDATE meet_ai_consents');
select ok(not has_table_privilege('anon', 'private.meet_ai_consents', 'DELETE'), 'anon cannot DELETE meet_ai_consents');
select ok(not has_table_privilege('authenticated', 'private.meet_ai_consents', 'SELECT'), 'authenticated cannot SELECT meet_ai_consents');
select ok(not has_table_privilege('authenticated', 'private.meet_ai_consents', 'INSERT'), 'authenticated cannot INSERT meet_ai_consents');
select ok(not has_table_privilege('authenticated', 'private.meet_ai_consents', 'UPDATE'), 'authenticated cannot UPDATE meet_ai_consents');
select ok(not has_table_privilege('authenticated', 'private.meet_ai_consents', 'DELETE'), 'authenticated cannot DELETE meet_ai_consents');
select ok((select relrowsecurity from pg_class where oid = 'public.workspace_meet_settings'::regclass), 'workspace_meet_settings RLS enabled');
select ok(not has_table_privilege('anon', 'public.workspace_meet_settings', 'SELECT'), 'anon cannot SELECT workspace_meet_settings');
select ok(not has_table_privilege('anon', 'public.workspace_meet_settings', 'INSERT'), 'anon cannot INSERT workspace_meet_settings');
select ok(not has_table_privilege('anon', 'public.workspace_meet_settings', 'UPDATE'), 'anon cannot UPDATE workspace_meet_settings');
select ok(not has_table_privilege('anon', 'public.workspace_meet_settings', 'DELETE'), 'anon cannot DELETE workspace_meet_settings');
select ok(not has_table_privilege('service_role', 'private.meet_ai_consents', 'UPDATE'), 'consent evidence cannot be overwritten');
select ok(has_table_privilege('service_role', 'private.meet_ai_consents', 'INSERT'), 'service can append consent');
insert into auth.users(id) values ('00000000-0000-4000-8000-000000008801'),('00000000-0000-4000-8000-000000008802'),('00000000-0000-4000-8000-000000008803');
insert into public.users(id) values ('00000000-0000-4000-8000-000000008801') on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values ('00000000-0000-4000-8000-000000008811', 'Consent test', false, '00000000-0000-4000-8000-000000008801');
update public.workspace_default_permissions set enabled = false where ws_id = '00000000-0000-4000-8000-000000008811' and permission = 'admin';
insert into public.workspace_meet_settings(ws_id) values ('00000000-0000-4000-8000-000000008811');
select is((select transcript_retention_days from public.workspace_meet_settings where ws_id = '00000000-0000-4000-8000-000000008811'), 365, '365 day default');
select ok((select per_person_opt_in and audio_retention_hours = 0 and transcription_default = 'ask' from public.workspace_meet_settings where ws_id = '00000000-0000-4000-8000-000000008811'), 'opt-in with no audio');
-- A real authenticated outsider belongs to a different workspace.
insert into public.users(id) values ('00000000-0000-4000-8000-000000008803') on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values
 ('00000000-0000-4000-8000-000000008812', 'Other workspace', false, '00000000-0000-4000-8000-000000008803');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000008803', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000008803","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.workspace_meet_settings where ws_id = '00000000-0000-4000-8000-000000008811'), 0, 'outsider sees no settings');
select throws_ok($$insert into public.workspace_meet_settings(ws_id) values ('00000000-0000-4000-8000-000000008811')$$, '42501', null, 'outsider cannot insert settings');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000008801', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000008801","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.workspace_meet_settings where ws_id = '00000000-0000-4000-8000-000000008811'), 1, 'workspace creator can read settings');
select lives_ok($$update public.workspace_meet_settings set transcript_retention_days = 90 where ws_id = '00000000-0000-4000-8000-000000008811'$$, 'workspace admin can change retention');
select is((select transcript_retention_days from public.workspace_meet_settings where ws_id = '00000000-0000-4000-8000-000000008811'), 90, 'admin update persisted');
reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
insert into public.users(id) values ('00000000-0000-4000-8000-000000008802') on conflict do nothing;
insert into public.workspace_members(ws_id, user_id, type) values ('00000000-0000-4000-8000-000000008811', '00000000-0000-4000-8000-000000008802', 'MEMBER');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000008802', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000008802","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.workspace_meet_settings where ws_id = '00000000-0000-4000-8000-000000008811'), 1, 'member reads settings');
update public.workspace_meet_settings set transcript_retention_days = 30 where ws_id = '00000000-0000-4000-8000-000000008811';
select is((select transcript_retention_days from public.workspace_meet_settings where ws_id = '00000000-0000-4000-8000-000000008811'), 90, 'ordinary member cannot update settings');
delete from public.workspace_meet_settings where ws_id = '00000000-0000-4000-8000-000000008811';
select is((select count(*)::integer from public.workspace_meet_settings where ws_id = '00000000-0000-4000-8000-000000008811'), 1, 'ordinary member cannot delete settings');
reset role;
-- F7: a client must not rewind either side of the (created_at, id) order.
insert into public.workspace_meetings(id, ws_id, creator_id, name, time) values
 ('00000000-0000-4000-8000-000000008821', '00000000-0000-4000-8000-000000008811', '00000000-0000-4000-8000-000000008801', 'F7', now());
insert into public.meet_ai_sessions(id, meeting_id, user_id) values
 ('00000000-0000-4000-8000-000000008831', '00000000-0000-4000-8000-000000008821', '00000000-0000-4000-8000-000000008801');
set local role service_role;
insert into private.meet_ai_consents(id, session_id, user_id, decision, notice_version, created_at) values
 ('00000000-0000-4000-8000-000000008841', '00000000-0000-4000-8000-000000008831', '00000000-0000-4000-8000-000000008801', 'allow', 'v1', now() - interval '1 minute'),
 ('00000000-0000-4000-8000-000000008842', '00000000-0000-4000-8000-000000008831', '00000000-0000-4000-8000-000000008801', 'allow', 'v1', now()),
 ('00000000-0000-4000-8000-000000008843', '00000000-0000-4000-8000-000000008831', '00000000-0000-4000-8000-000000008801', 'withdraw', 'v1', now());
reset role;
create temporary view latest_consent as select id, decision from private.meet_ai_consents
 where session_id = '00000000-0000-4000-8000-000000008831'
 order by created_at desc, id desc limit 1;
select is((select id::text from latest_consent), '00000000-0000-4000-8000-000000008843', 'UUID breaks equal-time ties');
set local role authenticated;
select throws_ok($$delete from private.meet_ai_consents where id = '00000000-0000-4000-8000-000000008843'$$, '42501', null, 'authenticated cannot delete the latest withdrawal');
select throws_ok($$update private.meet_ai_consents set decision = 'allow', created_at = now() - interval '2 minutes' where id = '00000000-0000-4000-8000-000000008843'$$, '42501', null, 'authenticated cannot rewrite or reorder withdrawal');
reset role;
select is((select decision from latest_consent), 'withdraw', 'authenticated cannot revive earlier allow');
select is((select count(*)::int from private.meet_ai_consents where session_id = '00000000-0000-4000-8000-000000008831'), 3, 'authenticated leaves the complete log intact');
set local role anon;
select throws_ok($$delete from private.meet_ai_consents where id = '00000000-0000-4000-8000-000000008843'$$, '42501', null, 'anon cannot delete the latest withdrawal');
select throws_ok($$update private.meet_ai_consents set decision = 'allow', created_at = now() - interval '2 minutes' where id = '00000000-0000-4000-8000-000000008843'$$, '42501', null, 'anon cannot rewrite or reorder withdrawal');
reset role;
select is((select decision from latest_consent), 'withdraw', 'anon cannot revive earlier allow');
select is((select count(*)::int from private.meet_ai_consents where session_id = '00000000-0000-4000-8000-000000008831'), 3, 'anon leaves the complete log intact');
select * from finish();
rollback;
