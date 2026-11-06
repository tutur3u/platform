begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(20);
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
select ok(not has_function_privilege('anon','private.employee_creation_runtime_ready(uuid)','EXECUTE'),'anon cannot observe runtime readiness');
select ok(not has_function_privilege('authenticated','private.employee_creation_runtime_ready(uuid)','EXECUTE'),'authenticated cannot observe runtime readiness');
select ok(has_function_privilege('service_role','private.employee_creation_runtime_ready(uuid)','EXECUTE'),'service can observe runtime readiness');
select ok(not has_function_privilege('anon','private.employee_creation_runtime_inspect(uuid,uuid)','EXECUTE'),'anon cannot inspect operations');
select ok(not has_function_privilege('authenticated','private.employee_creation_runtime_inspect(uuid,uuid)','EXECUTE'),'authenticated cannot inspect operations');
select ok(has_function_privilege('service_role','private.employee_creation_runtime_inspect(uuid,uuid)','EXECUTE'),'service can inspect operations');
create temporary table proof as select private.employee_creation_runtime_ready('00000000-0000-4000-8000-000000095001') value;
select is((select value->>'contract' from proof),'employee-http-rpc-v1','runtime contract is explicit');
select is((select value->>'ready' from proof),'true','current administrator and ACLs admit');
select matches((select value->>'finalizeSha256' from proof),'^[a-f0-9]{64}$','actual finalizer definition digest');
select matches((select value->>'confirmSha256' from proof),'^[a-f0-9]{64}$','actual confirmation definition digest');
select is(private.employee_creation_runtime_inspect('00000000-0000-4000-8000-000000095001',
  '00000000-0000-4000-8000-000000095010'),'{"operation":null,"account":null}'::jsonb,'absent commit remains absent');
select throws_ok($$select private.employee_creation_runtime_ready('00000000-0000-4000-8000-000000095002')$$,
  '42501','Employee administrator access denied','outsider cannot claim readiness');
select throws_ok($$select private.employee_creation_runtime_inspect('00000000-0000-4000-8000-000000095002',
  '00000000-0000-4000-8000-000000095010')$$,'42501','Employee administrator access denied','outsider cannot inspect');
create temporary table claimed as select private.employee_creation_operation_claim(
  '00000000-0000-4000-8000-000000095001','00000000-0000-4000-8000-000000095010',
  'rpc-employee@tuturuuu.com','RPC Employee') value;
create temporary table observed as select private.employee_creation_runtime_inspect(
  '00000000-0000-4000-8000-000000095001','00000000-0000-4000-8000-000000095010') value;
select is((select value->'operation' from observed),(select value->'operation' from claimed),'observation returns the actual stable reservation');
select is((select value->'account' from observed),'null'::jsonb,'reservation cannot publish account success');
select private.employee_creation_operation_advance('00000000-0000-4000-8000-000000095001',
  '00000000-0000-4000-8000-000000095010',(value->'operation'->>'leaseId')::uuid,0,
  '00000000-0000-4000-8000-000000095011','auth_attempted',null) from claimed;
select is(private.employee_creation_runtime_inspect('00000000-0000-4000-8000-000000095001',
  '00000000-0000-4000-8000-000000095010')->'operation'->>'phase','auth_attempted','attempt phase is observable');
select is(private.employee_creation_runtime_inspect('00000000-0000-4000-8000-000000095001',
  '00000000-0000-4000-8000-000000095010')->'operation'->>'version','1','actual CAS version is observable');
grant execute on function private.finalize_employee_creation(uuid,uuid,text,text) to authenticated;
select throws_ok($$select private.employee_creation_runtime_ready('00000000-0000-4000-8000-000000095001')$$,
  '42501','Employee runtime contract unavailable','expanded finalizer ACL denies runtime');
revoke execute on function private.finalize_employee_creation(uuid,uuid,text,text) from authenticated;
select is(private.employee_creation_runtime_ready('00000000-0000-4000-8000-000000095001')->>'ready','true','restored ACL admits again');
set local role service_role;
select is(private.employee_creation_runtime_inspect('00000000-0000-4000-8000-000000095001',
  '00000000-0000-4000-8000-000000095010')->'operation'->>'phase','auth_attempted','real service role can observe retained attempt');
reset role;
select * from finish();
rollback;
