begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(9);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000095001','rpc-admin@tuturuuu.com',now(),'{}','{}'),
('00000000-0000-4000-8000-000000095002','rpc-outsider@example.com',now(),'{}','{}');
-- A confirmed address alone is not a verified staff identity.
insert into auth.identities(provider_id,user_id,provider,identity_data)
select id::text,id,'email',jsonb_build_object('sub',id::text,'email',email)
from auth.users where id='00000000-0000-4000-8000-000000095001';
insert into public.workspaces(id,name,creator_id,personal) values
('00000000-0000-0000-0000-000000000000','RPC fixture','00000000-0000-4000-8000-000000095001',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000095001','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';

select is(private.employee_creation_runtime_ready('00000000-0000-4000-8000-000000095001')->>'ready', 'true', 'hardened paths admit readiness');
alter function private.finalize_employee_creation(uuid,uuid,text,text) set search_path = public, pg_temp;
select throws_ok($$select private.employee_creation_runtime_ready('00000000-0000-4000-8000-000000095001')$$,
  '42501', 'Employee runtime contract unavailable', 'unexpected path denies readiness');
alter function private.finalize_employee_creation(uuid,uuid,text,text) reset search_path;
select throws_ok($$select private.employee_creation_runtime_ready('00000000-0000-4000-8000-000000095001')$$,
  '42501', 'Employee runtime contract unavailable', 'inherited path denies readiness');
alter function private.finalize_employee_creation(uuid,uuid,text,text) set search_path = pg_catalog, pg_temp;
select is(private.employee_creation_runtime_ready('00000000-0000-4000-8000-000000095001')->>'ready', 'true', 'restored path admits readiness');
select is(public.strict_payload_field_byte_limit('ai_chat_messages','metadata'),10485760,'AI metadata exemption retained');
select is(public.strict_payload_field_byte_limit('task_history','new_value'),409600,'task history exemption retained');
-- Include JSON string quotes in the byte boundary; exercise the real trigger and CHECK.
select lives_ok($$insert into public.workspace_whiteboards(id,ws_id,creator_id,title,snapshot)
values ('00000000-0000-4000-8000-000000095099','00000000-0000-0000-0000-000000000000',
'00000000-0000-4000-8000-000000095001','Boundary',to_jsonb(repeat('x',26214398)))$$,
'exactly 25 MiB snapshot is accepted');
select throws_ok($$update public.workspace_whiteboards set snapshot=to_jsonb(repeat('x',26214399))
where id='00000000-0000-4000-8000-000000095099'$$, '22001', 'PAYLOAD_FIELD_BYTES_EXCEEDED: workspace_whiteboards.snapshot exceeds 26214400 bytes', 'one byte over 25 MiB is rejected');
select is((select octet_length(snapshot::text) from public.workspace_whiteboards where id='00000000-0000-4000-8000-000000095099'),26214400,'rejected update preserves snapshot');
select * from finish();
rollback;
