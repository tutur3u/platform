begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(27);

-- M1 rule: meeting transcripts and AI notes are readable only by participants
-- of the call and workspace admins. Participation lives in the room service, so
-- no client role may read a transcript or notes table directly; the application
-- gate (room policy + has_workspace_permission(..., 'admin')) is the only reader.
select set_config('request.jwt.claims','{}',true);
insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000009901'),
  ('00000000-0000-4000-8000-000000009902'),
  ('00000000-0000-4000-8000-000000009903'),
  ('00000000-0000-4000-8000-000000009904'),
  ('00000000-0000-4000-8000-000000009905'),
  ('00000000-0000-4000-8000-000000009906');
insert into public.users(id) values
  ('00000000-0000-4000-8000-000000009901'),
  ('00000000-0000-4000-8000-000000009902'),
  ('00000000-0000-4000-8000-000000009903'),
  ('00000000-0000-4000-8000-000000009904'),
  ('00000000-0000-4000-8000-000000009905'),
  ('00000000-0000-4000-8000-000000009906') on conflict do nothing;
-- 01 host (creator, not workspace creator), 02 participant member, 03 non-participant member,
-- 04 outsider, 05 workspace admin by role, 06 guest participant (no membership)
insert into public.workspaces(id, name, personal, creator_id) values
  ('00000000-0000-4000-8000-000000009911','Notes boundary',false,'00000000-0000-4000-8000-000000009906'),
  ('00000000-0000-4000-8000-000000009912','Other notes boundary',false,'00000000-0000-4000-8000-000000009906');
update public.workspace_default_permissions set enabled = false
  where ws_id in ('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009912') and permission = 'admin';
insert into public.workspace_members(ws_id,user_id,type) values
  ('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009901','MEMBER'),
  ('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009902','MEMBER'),
  ('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009903','MEMBER'),
  ('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009905','MEMBER'),
  ('00000000-0000-4000-8000-000000009912','00000000-0000-4000-8000-000000009903','MEMBER') on conflict do nothing;
insert into public.workspace_roles(id,ws_id,name) values
  ('00000000-0000-4000-8000-000000009921','00000000-0000-4000-8000-000000009911','Admin');
insert into public.workspace_role_permissions(ws_id,role_id,permission,enabled) values
  ('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009921','admin',true)
  on conflict (ws_id, permission, role_id) do update set enabled = excluded.enabled;
insert into public.workspace_role_members(role_id,user_id) values
  ('00000000-0000-4000-8000-000000009921','00000000-0000-4000-8000-000000009905');
insert into public.workspace_meetings(id,ws_id,creator_id,name,time) values
  ('00000000-0000-4000-8000-000000009931','00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009901','Boundary meeting',now());
insert into public.meet_ai_sessions(id,meeting_id,user_id,notes) values
  ('00000000-0000-4000-8000-000000009941','00000000-0000-4000-8000-000000009931','00000000-0000-4000-8000-000000009901','{"summary":"synthetic"}');
insert into public.meet_ai_chunks(id,session_id,sequence,start_seconds,duration_seconds,transcript) values
  ('00000000-0000-4000-8000-000000009951','00000000-0000-4000-8000-000000009941',0,0,10,'Synthetic transcript');
insert into public.recording_sessions(id,user_id,meeting_id,status) values
  ('00000000-0000-4000-8000-000000009961','00000000-0000-4000-8000-000000009902','00000000-0000-4000-8000-000000009931','completed');
insert into private.recording_transcripts(session_id,text) values
  ('00000000-0000-4000-8000-000000009961','Synthetic recording transcript');

-- Table-level: no client role holds a read grant on any transcript/notes table.
select ok(not has_table_privilege('anon','public.meet_ai_sessions','SELECT'),'anon cannot read notes');
select ok(not has_table_privilege('anon','public.meet_ai_chunks','SELECT'),'anon cannot read live transcripts');
select ok(not has_table_privilege('authenticated','public.meet_ai_sessions','SELECT'),'authenticated cannot read notes directly');
select ok(not has_table_privilege('authenticated','public.meet_ai_chunks','SELECT'),'authenticated cannot read live transcripts directly');
select ok(not has_table_privilege('authenticated','private.recording_transcripts','SELECT'),'authenticated cannot read recording transcripts');
select ok(not has_schema_privilege('authenticated','private','USAGE'),'authenticated cannot reach the private schema');
-- No permissive policy may re-open a membership-wide (or any client) read path.
-- Restrictive policies (for example required MFA) can only narrow access.
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename in ('meet_ai_sessions','meet_ai_chunks') and cmd in ('SELECT','ALL') and permissive='PERMISSIVE' and roles && array['authenticated','anon','public']::name[]),0,'no client read policy on notes or live transcripts');
select is((select count(*)::integer from pg_policies where schemaname='private' and tablename='recording_transcripts' and permissive='PERMISSIVE' and roles && array['authenticated','anon','public']::name[]),0,'no client policy on recording transcripts');

-- Role-level: each persona is denied; only the service role (behind the application gate) reads.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009902","role":"authenticated"}',true);
select throws_ok($$select * from public.meet_ai_chunks$$,'42501',null,'participant cannot read chunks except through the gate');
select throws_ok($$select * from public.meet_ai_sessions$$,'42501',null,'participant cannot read notes except through the gate');
select throws_ok($$select * from private.recording_transcripts$$,'42501',null,'recorder cannot bypass the gate for recording transcripts');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009903","role":"authenticated"}',true);
select throws_ok($$select * from public.meet_ai_chunks$$,'42501',null,'non-participant member denied chunks');
select throws_ok($$select * from public.meet_ai_sessions$$,'42501',null,'non-participant member denied notes');
select throws_ok($$select * from private.recording_transcripts$$,'42501',null,'non-participant member denied recording transcripts');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009904","role":"authenticated"}',true);
select throws_ok($$select * from public.meet_ai_chunks$$,'42501',null,'outsider denied chunks');
select throws_ok($$select * from public.meet_ai_sessions$$,'42501',null,'outsider denied notes');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009906","role":"authenticated"}',true);
select throws_ok($$select * from public.meet_ai_chunks$$,'42501',null,'guest denied direct chunk reads');
select throws_ok($$select * from public.meet_ai_sessions$$,'42501',null,'guest denied direct note reads');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009905","role":"authenticated"}',true);
select throws_ok($$select * from public.meet_ai_chunks$$,'42501',null,'admin reads through the application gate, not direct table access');
reset role;
set local role anon;
select throws_ok($$select * from public.meet_ai_sessions$$,'42501',null,'anon denied notes');
reset role;
set local role service_role;
select is((select count(*) from public.meet_ai_chunks where id='00000000-0000-4000-8000-000000009951'),1::bigint,'the application gate can read chunks');
select is((select count(*) from private.recording_transcripts where session_id='00000000-0000-4000-8000-000000009961'),1::bigint,'the application gate can read recording transcripts');
reset role;

-- The admin half of the gate: workspace admin permission, checked in the meeting's own workspace.
select ok(public.has_workspace_permission('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009905','admin'),'role admin passes in the meeting workspace');
select ok(not public.has_workspace_permission('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009903','admin'),'ordinary member is not admin');
select ok(not public.has_workspace_permission('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009904','admin'),'outsider is not admin');
select ok(not public.has_workspace_permission('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009902','admin'),'a participant is not admin by participating');
select ok(not public.has_workspace_permission('00000000-0000-4000-8000-000000009912','00000000-0000-4000-8000-000000009905','admin'),'admin of one workspace is not admin of another');
select * from finish();
rollback;
