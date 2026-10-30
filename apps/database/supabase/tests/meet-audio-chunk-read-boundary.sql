begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

-- M1 rule extended to recorded audio: the chunk listing is readable only by the
-- recorded identity, the meeting host and workspace admins of that workspace.
select set_config('request.jwt.claims','{}',true);
insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000009a01'),
  ('00000000-0000-4000-8000-000000009a02'),
  ('00000000-0000-4000-8000-000000009a03'),
  ('00000000-0000-4000-8000-000000009a04'),
  ('00000000-0000-4000-8000-000000009a05'),
  ('00000000-0000-4000-8000-000000009a06');
insert into public.users(id) values
  ('00000000-0000-4000-8000-000000009a01'),
  ('00000000-0000-4000-8000-000000009a02'),
  ('00000000-0000-4000-8000-000000009a03'),
  ('00000000-0000-4000-8000-000000009a04'),
  ('00000000-0000-4000-8000-000000009a05'),
  ('00000000-0000-4000-8000-000000009a06') on conflict do nothing;
-- 01 host, 02 recorded participant, 03 non-participant member, 04 outsider,
-- 05 workspace admin by role, 06 workspace creator (not a member of the meeting roles)
insert into public.workspaces(id, name, personal, creator_id) values
  ('00000000-0000-4000-8000-000000009a11','Audio boundary',false,'00000000-0000-4000-8000-000000009a06');
update public.workspace_default_permissions set enabled = false
  where ws_id = '00000000-0000-4000-8000-000000009a11' and permission = 'admin';
insert into public.workspace_members(ws_id,user_id,type) values
  ('00000000-0000-4000-8000-000000009a11','00000000-0000-4000-8000-000000009a01','MEMBER'),
  ('00000000-0000-4000-8000-000000009a11','00000000-0000-4000-8000-000000009a02','MEMBER'),
  ('00000000-0000-4000-8000-000000009a11','00000000-0000-4000-8000-000000009a03','MEMBER'),
  ('00000000-0000-4000-8000-000000009a11','00000000-0000-4000-8000-000000009a05','MEMBER') on conflict do nothing;
insert into public.workspace_roles(id,ws_id,name) values
  ('00000000-0000-4000-8000-000000009a21','00000000-0000-4000-8000-000000009a11','Admin');
insert into public.workspace_role_permissions(ws_id,role_id,permission,enabled) values
  ('00000000-0000-4000-8000-000000009a11','00000000-0000-4000-8000-000000009a21','admin',true)
  on conflict (ws_id, permission, role_id) do update set enabled = excluded.enabled;
insert into public.workspace_role_members(role_id,user_id) values
  ('00000000-0000-4000-8000-000000009a21','00000000-0000-4000-8000-000000009a05');
insert into public.workspace_meetings(id,ws_id,creator_id,name,time) values
  ('00000000-0000-4000-8000-000000009a31','00000000-0000-4000-8000-000000009a11','00000000-0000-4000-8000-000000009a01','Audio meeting',now());
insert into public.recording_sessions(id,user_id,meeting_id,status) values
  ('00000000-0000-4000-8000-000000009a41','00000000-0000-4000-8000-000000009a02','00000000-0000-4000-8000-000000009a31','completed');
insert into public.audio_chunks(id,session_id,chunk_order,storage_path) values
  ('00000000-0000-4000-8000-000000009a51','00000000-0000-4000-8000-000000009a41',0,'00000000-0000-4000-8000-000000009a11/recordings/00000000-0000-4000-8000-000000009a31/00000000-0000-4000-8000-000000009a41/0.webm');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009a02","role":"authenticated"}',true);
select is((select count(*) from public.audio_chunks),1::bigint,'the recorded participant lists the chunks');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009a01","role":"authenticated"}',true);
select is((select count(*) from public.audio_chunks),1::bigint,'the meeting host lists the chunks');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009a05","role":"authenticated"}',true);
select ok(public.has_workspace_permission('00000000-0000-4000-8000-000000009a11', auth.uid(), 'admin'), 'audio policy admin checks remain allowed for the caller');
select is((select count(*) from public.audio_chunks),1::bigint,'a workspace admin lists the chunks');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009a03","role":"authenticated"}',true);
select ok(not public.has_workspace_permission('00000000-0000-4000-8000-000000009a11', auth.uid(), 'admin'), 'the non-recorder member has no admin grant');
select is((select count(*) from public.audio_chunks),0::bigint,'a member who did not take part sees no chunks');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009a04","role":"authenticated"}',true);
select is((select count(*) from public.audio_chunks),0::bigint,'an outsider sees no chunks');
reset role;
set local role anon;
select throws_ok($$select * from public.audio_chunks$$,'42501',null,'anon cannot read chunks');
reset role;
set local role service_role;
select is((select count(*) from public.audio_chunks where id='00000000-0000-4000-8000-000000009a51'),1::bigint,'the service role still reads chunks');
reset role;
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='audio_chunks' and policyname='legacy_audio_chunk_select_participant' and permissive='RESTRICTIVE' and cmd='SELECT'),'the read fence is a restrictive SELECT policy');
select * from finish();
rollback;
