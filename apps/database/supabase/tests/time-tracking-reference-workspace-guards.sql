begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
-- 91501 manager (creator of workspace A), 91502 requester, 91503 other member.
insert into auth.users(id) values(pg_temp.fid(91501)),(pg_temp.fid(91502)),(pg_temp.fid(91503));
insert into public.users(id) values(pg_temp.fid(91501)),(pg_temp.fid(91502)),(pg_temp.fid(91503)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
  (pg_temp.fid(91511),'Synthetic workspace A',false,pg_temp.fid(91501)),
  (pg_temp.fid(91512),'Synthetic workspace B',false,pg_temp.fid(91501));
insert into public.workspace_members(ws_id,user_id,type) values
  (pg_temp.fid(91511),pg_temp.fid(91501),'MEMBER'),
  (pg_temp.fid(91511),pg_temp.fid(91502),'MEMBER'),
  (pg_temp.fid(91511),pg_temp.fid(91503),'MEMBER'),
  (pg_temp.fid(91512),pg_temp.fid(91502),'MEMBER'),
  (pg_temp.fid(91512),pg_temp.fid(91503),'MEMBER') on conflict do nothing;
insert into public.time_tracking_categories(id,ws_id,name) values
  (pg_temp.fid(91521),pg_temp.fid(91511),'Synthetic category A'),
  (pg_temp.fid(91522),pg_temp.fid(91512),'Synthetic category B'),
  (pg_temp.fid(91523),pg_temp.fid(91511),'Synthetic category A2');
insert into public.workspace_boards(id,ws_id,name) values
  (pg_temp.fid(91531),pg_temp.fid(91511),'Synthetic board A'),
  (pg_temp.fid(91532),pg_temp.fid(91512),'Synthetic board B');
insert into public.task_lists(id,board_id,name) values
  (pg_temp.fid(91541),pg_temp.fid(91531),'Synthetic list A'),
  (pg_temp.fid(91542),pg_temp.fid(91532),'Synthetic list B');
insert into public.tasks(id,list_id,name) values
  (pg_temp.fid(91551),pg_temp.fid(91541),'Synthetic task A'),
  (pg_temp.fid(91552),pg_temp.fid(91542),'Synthetic task B');

-- Sessions: category guard.
select lives_ok($q$insert into public.time_tracking_sessions(id,ws_id,user_id,title,category_id,start_time,end_time,is_running)
  values(pg_temp.fid(91561),pg_temp.fid(91511),pg_temp.fid(91502),'Same-workspace category',pg_temp.fid(91521),now()-interval '10 minutes',now(),false)$q$,
  'session accepts a same-workspace category');
select lives_ok($q$insert into public.time_tracking_sessions(id,ws_id,user_id,title,start_time,end_time,is_running)
  values(pg_temp.fid(91562),pg_temp.fid(91511),pg_temp.fid(91502),'No category',now()-interval '10 minutes',now(),false)$q$,
  'session accepts no category');
select throws_ok($q$insert into public.time_tracking_sessions(id,ws_id,user_id,title,category_id,start_time,end_time,is_running)
  values(pg_temp.fid(91563),pg_temp.fid(91511),pg_temp.fid(91502),'Foreign category',pg_temp.fid(91522),now()-interval '10 minutes',now(),false)$q$,
  '23514','time tracking session category must belong to the session workspace','session insert rejects a foreign category');
select throws_ok($q$update public.time_tracking_sessions set category_id=pg_temp.fid(91522) where id=pg_temp.fid(91562)$q$,
  '23514','time tracking session category must belong to the session workspace','session update rejects a foreign category');
select lives_ok($q$update public.time_tracking_sessions set category_id=pg_temp.fid(91523) where id=pg_temp.fid(91562)$q$,
  'session update accepts a same-workspace category');
select is((select category_id from public.time_tracking_sessions where id=pg_temp.fid(91562)),pg_temp.fid(91523),'rejected update left the accepted category in place');
select ok(not has_function_privilege('anon','public.enforce_time_tracking_session_category_workspace()','EXECUTE'),'anon cannot execute the session guard');
select ok(not has_function_privilege('authenticated','public.enforce_time_tracking_session_category_workspace()','EXECUTE'),'authenticated cannot execute the session guard');

-- Requests: task and category guard.
select lives_ok($q$insert into private.time_tracking_requests(id,workspace_id,user_id,task_id,category_id,title,start_time,end_time)
  values(pg_temp.fid(91571),pg_temp.fid(91511),pg_temp.fid(91502),pg_temp.fid(91551),pg_temp.fid(91521),'Same workspace',now()-interval '2 hours',now()-interval '1 hour')$q$,
  'request accepts a same-workspace task and category');
select throws_ok($q$insert into private.time_tracking_requests(id,workspace_id,user_id,category_id,title,start_time,end_time)
  values(pg_temp.fid(91572),pg_temp.fid(91511),pg_temp.fid(91502),pg_temp.fid(91522),'Foreign category',now()-interval '2 hours',now()-interval '1 hour')$q$,
  '23514','time tracking request category must belong to the request workspace','request insert rejects a foreign category');
select throws_ok($q$insert into private.time_tracking_requests(id,workspace_id,user_id,task_id,title,start_time,end_time)
  values(pg_temp.fid(91573),pg_temp.fid(91511),pg_temp.fid(91502),pg_temp.fid(91552),'Foreign task',now()-interval '2 hours',now()-interval '1 hour')$q$,
  '23514','time tracking request task must belong to the request workspace','request insert rejects a foreign task');
select throws_ok($q$update private.time_tracking_requests set category_id=pg_temp.fid(91522) where id=pg_temp.fid(91571)$q$,
  '23514','time tracking request category must belong to the request workspace','request update rejects a foreign category');
select throws_ok($q$update private.time_tracking_requests set task_id=pg_temp.fid(91552) where id=pg_temp.fid(91571)$q$,
  '23514','time tracking request task must belong to the request workspace','request update rejects a foreign task');
select ok(not has_function_privilege('anon','private.enforce_time_tracking_request_reference_workspace()','EXECUTE'),'anon cannot execute the request guard');
select ok(not has_function_privilege('authenticated','private.enforce_time_tracking_request_reference_workspace()','EXECUTE'),'authenticated cannot execute the request guard');

-- Linked sessions (SR-117 C2): approve and reject only touch the requester's own session.
insert into public.time_tracking_sessions(id,ws_id,user_id,title,start_time,end_time,is_running,pending_approval) values
  (pg_temp.fid(91581),pg_temp.fid(91511),pg_temp.fid(91502),'Own pending session',now()-interval '2 hours',now()-interval '1 hour',false,true),
  (pg_temp.fid(91582),pg_temp.fid(91511),pg_temp.fid(91503),'Other user pending session',now()-interval '2 hours',now()-interval '1 hour',false,true),
  (pg_temp.fid(91583),pg_temp.fid(91512),pg_temp.fid(91502),'Other workspace pending session',now()-interval '2 hours',now()-interval '1 hour',false,true);
insert into private.time_tracking_requests(id,workspace_id,user_id,title,start_time,end_time,linked_session_id) values
  (pg_temp.fid(91591),pg_temp.fid(91511),pg_temp.fid(91502),'Own link',now()-interval '2 hours',now()-interval '1 hour',pg_temp.fid(91581)),
  (pg_temp.fid(91592),pg_temp.fid(91511),pg_temp.fid(91502),'Other user link',now()-interval '2 hours',now()-interval '1 hour',pg_temp.fid(91582)),
  (pg_temp.fid(91593),pg_temp.fid(91511),pg_temp.fid(91502),'Other workspace link',now()-interval '2 hours',now()-interval '1 hour',pg_temp.fid(91583));
create temp table foreign_sessions as select jsonb_agg(to_jsonb(s) order by id) as snapshot
  from public.time_tracking_sessions s where id in(pg_temp.fid(91582),pg_temp.fid(91583));

select throws_ok($q$select private.update_time_tracking_request(pg_temp.fid(91592),'approve',pg_temp.fid(91511),pg_temp.fid(91501))$q$,
  '23514','Linked session must belong to the request workspace and user','approve rejects another user''s linked session');
select throws_ok($q$select private.update_time_tracking_request(pg_temp.fid(91593),'approve',pg_temp.fid(91511),pg_temp.fid(91501))$q$,
  '23514','Linked session must belong to the request workspace and user','approve rejects another workspace''s linked session');
select throws_ok($q$select private.update_time_tracking_request(pg_temp.fid(91592),'reject',pg_temp.fid(91511),pg_temp.fid(91501),'No')$q$,
  '23514','Linked session must belong to the request workspace and user','reject rejects another user''s linked session');
select throws_ok($q$select private.update_time_tracking_request(pg_temp.fid(91593),'reject',pg_temp.fid(91511),pg_temp.fid(91501),'No')$q$,
  '23514','Linked session must belong to the request workspace and user','reject rejects another workspace''s linked session');
select is((select jsonb_agg(to_jsonb(s) order by id) from public.time_tracking_sessions s where id in(pg_temp.fid(91582),pg_temp.fid(91583))),
  (select snapshot from foreign_sessions),'foreign sessions are untouched after the rejected calls');
select is((select approval_status::text from private.time_tracking_requests where id=pg_temp.fid(91592)),'PENDING','forged request stays pending after the rejected approve');

-- The status-change trigger applies the same filters when a request is flipped directly.
select set_config('time_tracking.bypass_approval_rules','on',true);
select set_config('time_tracking.override_auth_uid',pg_temp.fid(91501)::text,true);
select lives_ok($q$update private.time_tracking_requests set approval_status='APPROVED',approved_by=pg_temp.fid(91501),approved_at=now() where id=pg_temp.fid(91592)$q$,
  'direct approval of a forged request does not error');
select is((select pending_approval from public.time_tracking_sessions where id=pg_temp.fid(91582)),true,'trigger leaves another user''s session pending');

select lives_ok($q$select private.update_time_tracking_request(pg_temp.fid(91591),'approve',pg_temp.fid(91511),pg_temp.fid(91501))$q$,
  'approve accepts the requester''s own linked session');
select is((select pending_approval from public.time_tracking_sessions where id=pg_temp.fid(91581)),false,'own-session approve clears pending_approval');

select * from finish();
rollback;
