begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql as $$
 select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into auth.users(id) values(pg_temp.fid(90701)),(pg_temp.fid(90702)),(pg_temp.fid(90703));
insert into public.users(id) values(pg_temp.fid(90701)),(pg_temp.fid(90702)),(pg_temp.fid(90703)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
 (pg_temp.fid(90711),'Synthetic replacement scope',false,pg_temp.fid(90701)),
 (pg_temp.fid(90712),'Synthetic foreign scope',false,pg_temp.fid(90702));
insert into public.workspace_members(ws_id,user_id,type) values
 (pg_temp.fid(90711),pg_temp.fid(90702),'GUEST');
-- Workspace insertion creates each creator membership through add_ws_creator.
-- Assert that admission roles exist rather than masking duplicate fixture rows.
select is((select type::text from public.workspace_members where ws_id=pg_temp.fid(90711) and user_id=pg_temp.fid(90701)),'MEMBER','replacement scope creator is a member');
select is((select type::text from public.workspace_members where ws_id=pg_temp.fid(90712) and user_id=pg_temp.fid(90702)),'MEMBER','foreign scope creator is a member');
select is((select type::text from public.workspace_members where ws_id=pg_temp.fid(90711) and user_id=pg_temp.fid(90702)),'GUEST','foreign creator remains a guest in replacement scope');
select is((select count(*) from public.workspace_members where user_id=pg_temp.fid(90703)),0::bigint,'nonmember has no workspace membership before admission tests');
create function pg_temp.config() returns jsonb language sql as $$ select
 '{"focus_minutes":25,"short_break_minutes":5,"long_break_minutes":15,"sessions_until_long_break":4,"auto_start_breaks":false,"auto_start_focus":false}'::jsonb;
$$;
select private.configure_time_tracker_control(pg_temp.fid(90711),pg_temp.fid(90701),0,pg_temp.fid(90731),pg_temp.config());
create function pg_temp.replace(rev bigint,expected uuid,cmd integer,title text default 'Synthetic work') returns jsonb language sql as $$
 select private.replace_running_time_tracker_session(pg_temp.fid(90711),pg_temp.fid(90701),rev,expected,pg_temp.fid(cmd),title,null,null,null);
$$;
select ok(not has_table_privilege('service_role','private.time_tracker_operation_scopes','INSERT,UPDATE,DELETE'),'service cannot bypass operation CAS');
select ok(not has_table_privilege('authenticated','private.time_tracker_operation_receipts','SELECT,INSERT,UPDATE,DELETE'),'browser cannot read or change receipts');
select ok(not has_function_privilege('authenticated','private.replace_running_time_tracker_session(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid)','EXECUTE'),'browser cannot replace');
select ok(not has_function_privilege('anon','private.replace_running_time_tracker_session(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid)','EXECUTE'),'anonymous cannot replace');
select ok(has_function_privilege('service_role','private.replace_running_time_tracker_session(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid)','EXECUTE'),'service can replace through admission');
select throws_ok($q$select private.replace_running_time_tracker_session(pg_temp.fid(90711),pg_temp.fid(90703),0,null,pg_temp.fid(90732),'Synthetic',null,null,null)$q$,'42501','Insufficient permissions','nonmember denied');
select throws_ok($q$select private.replace_running_time_tracker_session(pg_temp.fid(90711),pg_temp.fid(90702),0,null,pg_temp.fid(90732),'Synthetic',null,null,null)$q$,'42501','Insufficient permissions','GUEST denied');
select throws_ok($q$select private.replace_running_time_tracker_session(pg_temp.fid(90712),pg_temp.fid(90701),0,null,pg_temp.fid(90732),'Synthetic',null,null,null)$q$,'42501','Insufficient permissions','wrong workspace denied');
select throws_ok($q$select pg_temp.replace(-1,null,90732)$q$,'22023','Invalid timer operation','negative CAS denied');
select throws_ok($q$select private.replace_running_time_tracker_session(pg_temp.fid(90711),pg_temp.fid(90701),0,null,pg_temp.fid(90732),'Synthetic',null,null,pg_temp.fid(90799))$q$,'22023','Task unavailable','unavailable task denied');
insert into public.time_tracking_categories(id,ws_id,name,color) values
 (pg_temp.fid(90721),pg_temp.fid(90712),'Synthetic foreign category','GRAY'),
 (pg_temp.fid(90722),pg_temp.fid(90711),'Synthetic scored category','BLUE');
select throws_ok($q$select private.replace_running_time_tracker_session(pg_temp.fid(90711),pg_temp.fid(90701),0,null,pg_temp.fid(90732),'Synthetic',null,pg_temp.fid(90721),null)$q$,'22023','Category unavailable','foreign category denied');
insert into public.workspace_boards(id,ws_id,name) values
 (pg_temp.fid(90761),pg_temp.fid(90711),'Synthetic own board'),
 (pg_temp.fid(90762),pg_temp.fid(90712),'Synthetic foreign board');
insert into public.task_lists(id,board_id,name) values
 (pg_temp.fid(90763),pg_temp.fid(90761),'Synthetic own list'),
 (pg_temp.fid(90764),pg_temp.fid(90762),'Synthetic foreign list');
insert into public.tasks(id,list_id,name) values
 (pg_temp.fid(90765),pg_temp.fid(90763),'Synthetic own task'),
 (pg_temp.fid(90766),pg_temp.fid(90764),'Synthetic foreign task');
select throws_ok($q$select private.replace_running_time_tracker_session(pg_temp.fid(90711),pg_temp.fid(90701),0,null,pg_temp.fid(90732),'Synthetic',null,null,pg_temp.fid(90766))$q$,'22023','Task unavailable','actual foreign task denied');
insert into public.workspace_members(ws_id,user_id,type) values(pg_temp.fid(90711),pg_temp.fid(90703),'MEMBER');
select throws_ok($q$select private.replace_running_time_tracker_session(pg_temp.fid(90711),pg_temp.fid(90703),0,null,pg_temp.fid(90732),'Synthetic',null,null,null)$q$,'55000','OFF control required','member without prepared control denied');
create temp table applied(n integer primary key,result jsonb);
insert into applied values(1,pg_temp.replace(0,null,90733));
select is((select result->>'applied_revision' from applied where n=1),'1','first command revision one');
select is((select count(*) from public.time_tracking_sessions where ws_id=pg_temp.fid(90711) and is_running),1::bigint,'one running session');
select is(pg_temp.replace(0,null,90733),(select result from applied where n=1),'identical replay returns applied snapshot');
select throws_ok($q$select pg_temp.replace(0,null,90733,'Changed')$q$,'40001','Timer command conflict','changed input cannot reuse command');
select throws_ok($q$select pg_temp.replace(0,null,90734)$q$,'40001','Timer revision conflict','stale revision rejected');
select throws_ok($q$select pg_temp.replace(1,null,90734)$q$,'40001','Timer running session conflict','explicit no-session CAS cannot replace a current row');
-- Make a real nonzero work interval without disabling accounting triggers.
update public.time_tracking_sessions set start_time=clock_timestamp()-interval '10 minutes',category_id=pg_temp.fid(90722)
 where id=(select (result->>'session_id')::uuid from applied where n=1);
insert into public.time_tracking_breaks(id,session_id,break_start,created_by) values
 (pg_temp.fid(90751),(select (result->>'session_id')::uuid from applied where n=1),clock_timestamp()-interval '2 seconds',pg_temp.fid(90701));
select throws_ok($q$select pg_temp.replace(1,(select (result->>'session_id')::uuid from applied where n=1),90734)$q$,'55000','Open break must be resolved','running-session open break cannot be bypassed');
-- Canonically completed historical break is admissible; no RPC auto-close.
update public.time_tracking_breaks set break_end=clock_timestamp() where id=pg_temp.fid(90751);
insert into private.time_tracking_requests(id,workspace_id,user_id,title,start_time,end_time,linked_session_id) values
 (pg_temp.fid(90752),pg_temp.fid(90711),pg_temp.fid(90701),'Synthetic linked request',clock_timestamp()-interval '10 seconds',clock_timestamp(),(select (result->>'session_id')::uuid from applied where n=1));
create temp table untouched as select
 (select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from private.time_tracking_requests r where workspace_id=pg_temp.fid(90711)) requests,
 (select coalesce(jsonb_agg(to_jsonb(b) order by id),'[]') from public.time_tracking_breaks b where session_id=(select (result->>'session_id')::uuid from applied where n=1)) breaks,
 (select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from private.time_tracking_request_activity a) activity,
 (select coalesce(jsonb_agg(to_jsonb(n) order by id),'[]') from public.notifications n) notifications;
insert into applied values(2,pg_temp.replace(1,(select (result->>'session_id')::uuid from applied where n=1),90734));
select is((select result->>'applied_revision' from applied where n=2),'2','replacement increments operation CAS');
select is(pg_temp.replace(0,null,90733),(select result from applied where n=1),'older retained receipt still replays after newer command');
select is((select count(*) from private.time_tracker_operation_receipts where ws_id=pg_temp.fid(90711)),2::bigint,'replays add no receipts');
select is((select s.end_time from public.time_tracking_sessions s where id=(select (result->>'session_id')::uuid from applied where n=1)),
 (select s.start_time from public.time_tracking_sessions s where id=(select (result->>'session_id')::uuid from applied where n=2)),'one DB transition timestamp closes and starts');
select is((select duration_seconds from public.time_tracking_sessions where id=(select (result->>'session_id')::uuid from applied where n=1)),
 (select extract(epoch from(end_time-start_time))::integer from public.time_tracking_sessions where id=(select (result->>'session_id')::uuid from applied where n=1)),'resolved duration trigger is canonical');
select cmp_ok((select productivity_score from public.time_tracking_sessions where id=(select (result->>'session_id')::uuid from applied where n=1)),'>',0,'categorized completed work retains nonzero productivity');
select is((select productivity_score from public.time_tracking_sessions where id=(select (result->>'session_id')::uuid from applied where n=1)),
 (select public.calculate_productivity_score(extract(epoch from(end_time-start_time))::integer,'BLUE') from public.time_tracking_sessions where id=(select (result->>'session_id')::uuid from applied where n=1)),'productivity trigger observes same-clock canonical duration despite legacy trigger ordering');
select is((select revision from private.time_tracker_controls where ws_id=pg_temp.fid(90711)),1::bigint,'config revision unchanged');
select is((select mode||'/'||phase from private.time_tracker_controls where ws_id=pg_temp.fid(90711)),'off/idle','no phase activation');
select is((select coalesce(jsonb_agg(to_jsonb(n) order by id),'[]') from public.notifications n),(select notifications from untouched),'ordinary replacement emits no notifications');
select is((select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from private.time_tracking_request_activity a),(select activity from untouched),'ordinary replacement emits no approval activity');
select is((select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from private.time_tracking_requests r where workspace_id=pg_temp.fid(90711)),(select requests from untouched),'replacement leaves linked request state untouched');
select is((select coalesce(jsonb_agg(to_jsonb(b) order by id),'[]') from public.time_tracking_breaks b where session_id=(select (result->>'session_id')::uuid from applied where n=1)),(select breaks from untouched),'replacement leaves completed historical break accounting untouched');
insert into public.workspace_roles(id,ws_id,name) values(pg_temp.fid(90771),pg_temp.fid(90711),'Synthetic reviewer');
insert into public.workspace_role_members(role_id,user_id) values(pg_temp.fid(90771),pg_temp.fid(90703));
insert into public.workspace_role_permissions(ws_id,role_id,permission,enabled)
 values(pg_temp.fid(90711),pg_temp.fid(90771),'manage_time_tracking_requests',true);
insert into public.notification_preferences(ws_id,user_id,event_type,channel,enabled,scope) values
 (pg_temp.fid(90711),pg_temp.fid(90701),'time_tracking_request_approved','web',true,'workspace'),
 (pg_temp.fid(90711),pg_temp.fid(90701),'time_tracking_request_approved','email',false,'workspace'),
 (pg_temp.fid(90711),pg_temp.fid(90701),'time_tracking_request_approved','push',false,'workspace') on conflict do nothing;
update public.notification_preferences set enabled=(channel='web') where ws_id=pg_temp.fid(90711) and user_id=pg_temp.fid(90701) and event_type='time_tracking_request_approved';
create function pg_temp.fail_approval() returns void language plpgsql as $$ begin
 perform private.update_time_tracking_request(pg_temp.fid(90752),'approve',pg_temp.fid(90711),pg_temp.fid(90703),null,null);
 if not exists(select 1 from private.time_tracking_request_activity where request_id=pg_temp.fid(90752) and action_type='STATUS_CHANGED' and actor_id=pg_temp.fid(90703) and new_status='APPROVED')
   or not exists(select 1 from public.notifications where entity_id=pg_temp.fid(90752) and type='time_tracking_request_approved' and user_id=pg_temp.fid(90701) and created_by=pg_temp.fid(90703)) then
   raise exception 'Approval effects missing' using errcode='P0002';
 end if;
 raise exception 'Synthetic approval boundary' using errcode='P0001'; end; $$;
select throws_ok($q$select pg_temp.fail_approval()$q$,'P0001','Synthetic approval boundary','actual approval triggers execute before synthetic downstream failure');
select is((select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from private.time_tracking_requests r where workspace_id=pg_temp.fid(90711)),(select requests from untouched),'failed approval restores linked request and status');
select is((select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from private.time_tracking_request_activity a),(select activity from untouched),'failed approval rolls back activity');
select is((select coalesce(jsonb_agg(to_jsonb(n) order by id),'[]') from public.notifications n),(select notifications from untouched),'failed approval rolls back notifications');
-- Temporary real trigger failures test transaction rollback; no production fault knob.
create function pg_temp.fail_write() returns trigger language plpgsql as $$ begin
 raise exception 'Synthetic boundary failure' using errcode='P0001'; end; $$;
create temp table before_failure as select to_jsonb(s) snapshot from public.time_tracking_sessions s
 where id=(select (result->>'session_id')::uuid from applied where n=2);
insert into public.time_tracking_sessions(id,ws_id,user_id,title,start_time,end_time,duration_seconds,is_running,parent_session_id)
 values(pg_temp.fid(90781),pg_temp.fid(90711),pg_temp.fid(90701),'Synthetic chain child',clock_timestamp()-interval '30 seconds',clock_timestamp()-interval '20 seconds',10,false,(select (result->>'session_id')::uuid from applied where n=2));
create function pg_temp.all_effects() returns jsonb language sql as $$ select jsonb_build_object(
 'sessions',(select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]') from public.time_tracking_sessions s where ws_id=pg_temp.fid(90711)),
 'breaks',(select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]') from public.time_tracking_breaks b join public.time_tracking_sessions s on s.id=b.session_id where s.ws_id=pg_temp.fid(90711)),
 'requests',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from private.time_tracking_requests r where workspace_id=pg_temp.fid(90711)),
 'activity',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from private.time_tracking_request_activity a join private.time_tracking_requests r on r.id=a.request_id where r.workspace_id=pg_temp.fid(90711)),
 'notifications',(select coalesce(jsonb_agg(to_jsonb(n) order by id),'[]') from public.notifications n where ws_id=pg_temp.fid(90711)),
 'scope',(select to_jsonb(o) from private.time_tracker_operation_scopes o where ws_id=pg_temp.fid(90711)),
 'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by command_id),'[]') from private.time_tracker_operation_receipts r where ws_id=pg_temp.fid(90711)),
 'config',(select to_jsonb(c) from private.time_tracker_controls c where ws_id=pg_temp.fid(90711)));
$$;
-- Paused sessions are not running, but their active breaks still block replacement.
insert into public.time_tracking_sessions(id,ws_id,user_id,title,start_time,end_time,is_running)
 values(pg_temp.fid(90782),pg_temp.fid(90711),pg_temp.fid(90701),'Synthetic paused work',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute',false);
insert into public.time_tracking_breaks(id,session_id,break_start,created_by)
 values(pg_temp.fid(90783),pg_temp.fid(90782),clock_timestamp()-interval '30 seconds',pg_temp.fid(90701));
create temp table before_open_break as select pg_temp.all_effects() snapshot;
select throws_ok($q$select pg_temp.replace(2,(select (result->>'session_id')::uuid from applied where n=2),90735)$q$,'55000','Open break must be resolved','paused-session open break cannot admit replacement');
select is(pg_temp.all_effects(),(select snapshot from before_open_break),'open-break rejection preserves all session/chain/break/request/activity/notification/control/receipt fields and credits');
-- Rollback-contained reported case: paused break, no running row, expected NULL.
create function pg_temp.replace_paused_only() returns void language plpgsql as $$ begin
 update public.time_tracking_sessions set is_running=false,end_time=clock_timestamp()
   where ws_id=pg_temp.fid(90711) and user_id=pg_temp.fid(90701) and is_running;
 if exists(select 1 from public.time_tracking_sessions where ws_id=pg_temp.fid(90711)
   and user_id=pg_temp.fid(90701) and is_running) then
   raise exception 'Synthetic paused-only fixture still running' using errcode='P0002';
 end if;
 perform pg_temp.replace(2,null,90735);
end; $$;
select throws_ok($q$select pg_temp.replace_paused_only()$q$,'55000','Open break must be resolved','paused-only break rejects expected NULL when no session is running');
select is(pg_temp.all_effects(),(select snapshot from before_open_break),'paused-only rejection rolls back fixture transition and every scoped effect');
delete from public.time_tracking_breaks where id=pg_temp.fid(90783);
delete from public.time_tracking_sessions where id=pg_temp.fid(90782);
create temp table all_before_failure as select pg_temp.all_effects() snapshot;
create trigger synthetic_replacement_failure before insert on public.time_tracking_sessions
 for each row execute function pg_temp.fail_write();
select throws_ok($q$select pg_temp.replace(2,(select (result->>'session_id')::uuid from applied where n=2),90735)$q$,'P0001','Synthetic boundary failure','insert failure remains failure');
drop trigger synthetic_replacement_failure on public.time_tracking_sessions;
select is(pg_temp.all_effects(),(select snapshot from all_before_failure),'insert fault restores all session/chain/break/request/activity/notification/control/receipt fields');
select is((select to_jsonb(s) from public.time_tracking_sessions s where id=(select (result->>'session_id')::uuid from applied where n=2)),(select snapshot from before_failure),'failed insert rolls back prior close and trigger fields');
create trigger synthetic_receipt_failure before insert on private.time_tracker_operation_receipts
 for each row execute function pg_temp.fail_write();
select throws_ok($q$select pg_temp.replace(2,(select (result->>'session_id')::uuid from applied where n=2),90735)$q$,'P0001','Synthetic boundary failure','receipt failure rolls back all session writes');
drop trigger synthetic_receipt_failure on private.time_tracker_operation_receipts;
select is(pg_temp.all_effects(),(select snapshot from all_before_failure),'receipt fault restores every scoped side-effect field after completed session writes');
select is((select revision from private.time_tracker_operation_scopes where ws_id=pg_temp.fid(90711)),2::bigint,'fault restores operation revision');
select is((select count(*) from public.time_tracking_sessions where ws_id=pg_temp.fid(90711)),3::bigint,'fault leaves no extra session, preserving chain child');
select is((select count(*) from private.time_tracker_operation_receipts where ws_id=pg_temp.fid(90711)),2::bigint,'fault leaves no receipt');
select is((select to_jsonb(s) from public.time_tracking_sessions s where id=(select (result->>'session_id')::uuid from applied where n=2)),(select snapshot from before_failure),'receipt fault restores prior running row');
update public.time_tracking_sessions set start_time=clock_timestamp()+interval '1 minute'
 where id=(select (result->>'session_id')::uuid from applied where n=2);
select throws_ok($q$select pg_temp.replace(2,(select (result->>'session_id')::uuid from applied where n=2),90735)$q$,'55000','Running session starts in the future','future active row cannot mint negative work credit');
update public.time_tracking_sessions set start_time=clock_timestamp()-interval '1 second'
 where id=(select (result->>'session_id')::uuid from applied where n=2);
insert into applied values(3,private.replace_running_time_tracker_session(pg_temp.fid(90711),pg_temp.fid(90701),2,(select (result->>'session_id')::uuid from applied where n=2),pg_temp.fid(90736),'Synthetic task work',null,null,pg_temp.fid(90765)));
select is((select task_id from public.time_tracking_sessions where id=(select (result->>'session_id')::uuid from applied where n=3)),pg_temp.fid(90765),'actual same-workspace task accepted');
delete from public.tasks where id=pg_temp.fid(90765);
select is(private.replace_running_time_tracker_session(pg_temp.fid(90711),pg_temp.fid(90701),2,(select (result->>'session_id')::uuid from applied where n=2),pg_temp.fid(90736),'Synthetic task work',null,null,pg_temp.fid(90765)),(select result from applied where n=3),'deleted task cannot turn historical replay into a new write');
select is((select revision from private.time_tracker_operation_scopes where ws_id=pg_temp.fid(90711)),3::bigint,'historical replay leaves latest revision unchanged');
-- Removed admission denies even an immutable historical replay.
delete from public.workspace_members where ws_id=pg_temp.fid(90711) and user_id=pg_temp.fid(90701);
select throws_ok($q$select pg_temp.replace(0,null,90733)$q$,'42501','Insufficient permissions','membership removal denies old replay');
-- Positive edit threshold must not prevent closing already-running work.
-- Reuse the creator membership established and asserted during setup.
select is((select type::text from public.workspace_members where ws_id=pg_temp.fid(90712) and user_id=pg_temp.fid(90702)),'MEMBER','edit-threshold scope retains its creator membership');
select private.configure_time_tracker_control(pg_temp.fid(90712),pg_temp.fid(90702),0,pg_temp.fid(90790),pg_temp.config());
insert into public.workspace_settings(ws_id,missed_entry_date_threshold) values(pg_temp.fid(90712),null)
 on conflict(ws_id) do update set missed_entry_date_threshold=null;
insert into public.time_tracking_sessions(id,ws_id,user_id,title,start_time,is_running)
 values(pg_temp.fid(90791),pg_temp.fid(90712),pg_temp.fid(90702),'Synthetic long-running work',clock_timestamp()-interval '2 days',true);
insert into public.workspace_settings(ws_id,missed_entry_date_threshold) values(pg_temp.fid(90712),1)
 on conflict(ws_id) do update set missed_entry_date_threshold=1;
create function pg_temp.long_replace(rev bigint,expected uuid,cmd integer) returns jsonb language sql as $$
 select private.replace_running_time_tracker_session(pg_temp.fid(90712),pg_temp.fid(90702),rev,expected,pg_temp.fid(cmd),'Synthetic replacement',null,null,null);
$$;
create temp table expected_insert_setting(value text);
insert into expected_insert_setting values('off');
create function pg_temp.check_insert_setting() returns trigger language plpgsql as $$ begin
 if new.ws_id=pg_temp.fid(90712) and current_setting('time_tracking.bypass_update_limit',true)
   is distinct from (select value from expected_insert_setting) then
   raise exception 'Close bypass leaked to insert' using errcode='P0002';
 end if;
 return new;
end; $$;
create trigger synthetic_insert_setting before insert on public.time_tracking_sessions
 for each row execute function pg_temp.check_insert_setting();
select set_config('time_tracking.bypass_update_limit','off',true);
insert into applied values(4,pg_temp.long_replace(0,pg_temp.fid(90791),90792));
select is(current_setting('time_tracking.bypass_update_limit',true),'off','long-running close restores prior off before new insert');
select ok((select not is_running and duration_seconds>=172800 from public.time_tracking_sessions where id=pg_temp.fid(90791)),'positive threshold permits canonical close of existing long-running work');
select set_config('time_tracking.bypass_update_limit','on',true);
update public.time_tracking_sessions set start_time=clock_timestamp()-interval '2 days'
 where id=(select (result->>'session_id')::uuid from applied where n=4);
update expected_insert_setting set value='on';
insert into applied values(5,pg_temp.long_replace(1,(select (result->>'session_id')::uuid from applied where n=4),90793));
select is(current_setting('time_tracking.bypass_update_limit',true),'on','close restores a caller prior on setting');
create function pg_temp.long_effects() returns jsonb language sql as $$ select jsonb_build_object(
 'sessions',(select jsonb_agg(to_jsonb(s) order by id) from public.time_tracking_sessions s where ws_id=pg_temp.fid(90712)),
 'scope',(select to_jsonb(s) from private.time_tracker_operation_scopes s where ws_id=pg_temp.fid(90712)),
 'receipts',(select jsonb_agg(to_jsonb(r) order by command_id) from private.time_tracker_operation_receipts r where ws_id=pg_temp.fid(90712)));
$$;
create temp table before_close_failure as select pg_temp.long_effects() snapshot;
create trigger synthetic_close_failure before update on public.time_tracking_sessions
 for each row execute function pg_temp.fail_write();
select set_config('time_tracking.bypass_update_limit','off',true);
select throws_ok($q$select pg_temp.long_replace(2,(select (result->>'session_id')::uuid from applied where n=5),90794)$q$,'P0001','Synthetic boundary failure','close failure propagates its original error');
select is(current_setting('time_tracking.bypass_update_limit',true),'off','caught failed close cannot leak temporary on to caller');
select is(pg_temp.long_effects(),(select snapshot from before_close_failure),'failed close restores sessions accounting revision and receipts');
select set_config('time_tracking.bypass_update_limit','on',true);
select throws_ok($q$select pg_temp.long_replace(2,(select (result->>'session_id')::uuid from applied where n=5),90794)$q$,'P0001','Synthetic boundary failure','failed close also propagates with prior on');
select is(current_setting('time_tracking.bypass_update_limit',true),'on','failed close preserves caller prior on');
drop trigger synthetic_close_failure on public.time_tracking_sessions;
drop trigger synthetic_insert_setting on public.time_tracking_sessions;
select set_config('time_tracking.bypass_update_limit','off',true);
-- Exercise the real invoker triggers through an empty-path caller, with no
-- replacement RPC or trigger disabling hiding their table/function bindings.
create function pg_temp.empty_path_trigger_controls() returns jsonb
language plpgsql set search_path='' as $$
declare
 v_first public.time_tracking_sessions%rowtype;
 v_second public.time_tracking_sessions%rowtype;
 v_end timestamptz;
begin
 insert into public.time_tracking_sessions(id,ws_id,user_id,title,category_id,start_time,is_running)
 values(pg_temp.fid(90795),pg_temp.fid(90711),pg_temp.fid(90703),'Synthetic empty-path scored work',pg_temp.fid(90722),clock_timestamp()-interval '10 minutes',true);
 v_end:=clock_timestamp();
 update public.time_tracking_sessions
 set end_time=v_end,is_running=false,duration_seconds=extract(epoch from(v_end-start_time))::integer
 where id=pg_temp.fid(90795);
 insert into public.time_tracking_sessions(id,ws_id,user_id,title,start_time,is_running)
 values(pg_temp.fid(90796),pg_temp.fid(90711),pg_temp.fid(90703),'Synthetic empty-path next work',clock_timestamp(),true);
 select * into v_first from public.time_tracking_sessions where id=pg_temp.fid(90795);
 select * into v_second from public.time_tracking_sessions where id=pg_temp.fid(90796);
 update public.time_tracking_sessions set end_time=clock_timestamp(),is_running=false
 where id=v_second.id;
 return jsonb_build_object(
  'first_closed',not v_first.is_running and v_first.end_time is not null,
  'canonical_duration',v_first.duration_seconds=extract(epoch from(v_first.end_time-v_first.start_time))::integer,
  'score',v_first.productivity_score,
  'canonical_score',public.calculate_productivity_score(v_first.duration_seconds,'BLUE'),
  'next_started',v_second.is_running,
  'next_stopped',(select not is_running and end_time is not null from public.time_tracking_sessions where id=v_second.id));
end;
$$;
create temp table empty_path_trigger_result as select pg_temp.empty_path_trigger_controls() result;
select ok((select (result->>'first_closed')::boolean from empty_path_trigger_result),'empty-path real session stop completes');
select ok((select (result->>'canonical_duration')::boolean from empty_path_trigger_result),'empty-path duration accounting remains canonical');
select cmp_ok((select (result->>'score')::integer from empty_path_trigger_result),'>',0,'empty-path categorized work has real productivity');
select is((select result->>'score' from empty_path_trigger_result),(select result->>'canonical_score' from empty_path_trigger_result),'empty-path productivity uses the canonical public calculator');
select ok((select (result->>'next_started')::boolean and (result->>'next_stopped')::boolean from empty_path_trigger_result),'empty-path subsequent real session starts and stops');
select * from finish();
rollback;
