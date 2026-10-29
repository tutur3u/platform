begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;

select is((select proconfig from pg_proc where oid='private.handle_request_status_change()'::regprocedure),
  array['search_path=pg_catalog, pg_temp'],'status-change trigger function pins search_path to pg_catalog, pg_temp');
select is((select proconfig from pg_proc where oid='private.update_time_tracking_request(uuid,text,uuid,uuid,text,text)'::regprocedure),
  array['search_path=pg_catalog, pg_temp'],'update request function pins search_path to pg_catalog, pg_temp');
select ok(has_function_privilege('service_role','private.update_time_tracking_request(uuid,text,uuid,uuid,text,text)','EXECUTE'),'service_role can execute the update function');
select ok(not has_function_privilege('anon','private.update_time_tracking_request(uuid,text,uuid,uuid,text,text)','EXECUTE'),'anon cannot execute the update function');
select ok(not has_function_privilege('authenticated','private.update_time_tracking_request(uuid,text,uuid,uuid,text,text)','EXECUTE'),'authenticated cannot execute the update function');
select ok(not has_function_privilege('authenticated','private.handle_request_status_change()','EXECUTE'),'authenticated cannot execute the status-change function');

-- 92501 manager, 92502 requester.
insert into auth.users(id) values(pg_temp.fid(92501)),(pg_temp.fid(92502));
insert into public.users(id) values(pg_temp.fid(92501)),(pg_temp.fid(92502)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
  (pg_temp.fid(92511),'Synthetic workspace',false,pg_temp.fid(92501));
insert into public.workspace_members(ws_id,user_id,type) values
  (pg_temp.fid(92511),pg_temp.fid(92501),'MEMBER'),
  (pg_temp.fid(92511),pg_temp.fid(92502),'MEMBER') on conflict do nothing;
insert into public.time_tracking_sessions(id,ws_id,user_id,title,start_time,end_time,is_running,pending_approval) values
  (pg_temp.fid(92561),pg_temp.fid(92511),pg_temp.fid(92502),'Pending session',now()-interval '2 hours',now()-interval '1 hour',false,true);
insert into private.time_tracking_requests(id,workspace_id,user_id,title,start_time,end_time,linked_session_id) values
  (pg_temp.fid(92571),pg_temp.fid(92511),pg_temp.fid(92502),'Linked request',now()-interval '2 hours',now()-interval '1 hour',pg_temp.fid(92561)),
  (pg_temp.fid(92572),pg_temp.fid(92511),pg_temp.fid(92502),'Unlinked request',now()-interval '3 hours',now()-interval '2 hours',null);

-- Request update path (definer function), run with the pinned search_path.
select lives_ok($q$select private.update_time_tracking_request(pg_temp.fid(92572),'needs_info',pg_temp.fid(92511),pg_temp.fid(92501),null,'Need details')$q$,
  'update function marks a request as needing info');
select is((select approval_status::text from private.time_tracking_requests where id=pg_temp.fid(92572)),'NEEDS_INFO','request moved to NEEDS_INFO');
select lives_ok($q$select private.update_time_tracking_request(pg_temp.fid(92571),'approve',pg_temp.fid(92511),pg_temp.fid(92501))$q$,
  'update function approves a linked request');
select is((select pending_approval from public.time_tracking_sessions where id=pg_temp.fid(92561)),false,
  'approval fired the status-change trigger and cleared pending_approval');

-- Reject path (definer function): deletes the linked session and clears the link.
insert into public.time_tracking_sessions(id,ws_id,user_id,title,start_time,end_time,is_running,pending_approval) values
  (pg_temp.fid(92562),pg_temp.fid(92511),pg_temp.fid(92502),'Pending session 2',now()-interval '2 hours',now()-interval '1 hour',false,true);
insert into private.time_tracking_requests(id,workspace_id,user_id,title,start_time,end_time,linked_session_id) values
  (pg_temp.fid(92573),pg_temp.fid(92511),pg_temp.fid(92502),'Linked request 2',now()-interval '2 hours',now()-interval '1 hour',pg_temp.fid(92562));
select lives_ok($q$select private.update_time_tracking_request(pg_temp.fid(92573),'reject',pg_temp.fid(92511),pg_temp.fid(92501),'No')$q$,
  'update function rejects a linked request');
select is((select count(*)::integer from public.time_tracking_sessions where id=pg_temp.fid(92562)),0,'reject deleted the linked session');
select is((select approval_status::text from private.time_tracking_requests where id=pg_temp.fid(92573)),'REJECTED','request moved to REJECTED');

select * from finish();
rollback;
