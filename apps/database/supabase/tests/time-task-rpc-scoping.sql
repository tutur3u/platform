begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql as $$
 select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
-- Each attempted call rolls back its own changes, including role and claims.
create function pg_temp.call_as(role_name text, actor uuid, statement text)
returns text language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('role',role_name,'sub',actor)::text,true);
 execute format('set local role %I',role_name);
 execute statement;
 raise exception using errcode='PT001';
exception when sqlstate 'PT001' then return 'ok';
 when others then return sqlstate;
end;
$$;
insert into auth.users(id) values(pg_temp.fid(90801)),(pg_temp.fid(90802));
insert into public.users(id) values(pg_temp.fid(90801)),(pg_temp.fid(90802)) on conflict do nothing;
insert into public.workspaces(id,name,creator_id) values
 (pg_temp.fid(90811),'Synthetic scope',pg_temp.fid(90801)),
 (pg_temp.fid(90812),'Synthetic foreign scope',pg_temp.fid(90802));
select ok(exists(select 1 from public.workspace_members where ws_id=pg_temp.fid(90811) and user_id=pg_temp.fid(90801)),
 'fixture actor belongs to the target workspace');

insert into public.time_tracking_sessions(id,ws_id,user_id,title,start_time,end_time,is_running) values
 (pg_temp.fid(90821),pg_temp.fid(90811),pg_temp.fid(90801),'Synthetic own session',now()-interval '10 minutes',now(),false),
 (pg_temp.fid(90822),pg_temp.fid(90811),pg_temp.fid(90802),'Synthetic other actor',now()-interval '10 minutes',now(),false),
 (pg_temp.fid(90823),pg_temp.fid(90812),pg_temp.fid(90801),'Synthetic other workspace',now()-interval '10 minutes',now(),false);
create temporary table writer_calls(signature text, statement text);
insert into writer_calls values
 ('public.insert_time_tracking_session_with_bypass(uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,integer,boolean)',
 $$select public.insert_time_tracking_session_with_bypass(pg_temp.fid(90811),pg_temp.fid(90801),'Synthetic insert',p_start_time=>now()-interval '2 minutes',p_end_time=>now(),p_is_running=>false)$$),
 ('public.update_time_tracking_session_with_bypass(uuid,jsonb)',
 $$select public.update_time_tracking_session_with_bypass(pg_temp.fid(90821),'{"title":"Synthetic edit"}')$$),
 ('public.pause_session_for_break(uuid,timestamptz,integer)',
 $$select public.pause_session_for_break(p_session_id=>pg_temp.fid(90821),p_end_time=>now(),p_duration_seconds=>600)$$),
 ('public.pause_session_for_break(uuid,timestamptz,integer,boolean)',
 $$select public.pause_session_for_break(pg_temp.fid(90821),now(),600,false)$$),
 ('public.get_workspace_time_tracking_stats(uuid,timestamptz)',
 $$select public.get_workspace_time_tracking_stats(pg_temp.fid(90811))$$);
select ok(not has_function_privilege(role_name,signature,'EXECUTE'),role_name||' cannot execute '||signature)
 from writer_calls cross join unnest(array['anon','authenticated']) role_name;
select ok(has_function_privilege('service_role',signature,'EXECUTE'),'service can execute '||signature) from writer_calls;
select is(md5(rtrim(regexp_replace(pg_get_functiondef(signature::regprocedure),'[[:blank:]]+$','','ng'),E' \n\r\t')),expected,'writer definition retained: '||signature)
from (values
('public.get_workspace_time_tracking_stats(uuid,timestamptz)','36c7fe335b2155d031732cb7794082ff'),
('public.insert_time_tracking_session_with_bypass(uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,integer,boolean)','3f14df52f71d292264294f86542614f2'),
('public.pause_session_for_break(uuid,timestamptz,integer)','1e507a7223ec13da2b79fc8ea0cff0aa'),
('public.pause_session_for_break(uuid,timestamptz,integer,boolean)','82d5378a7b69b44d8d06d2a95d5c6b0f'),
('public.update_time_tracking_session_with_bypass(uuid,jsonb)','36e2f4cbfa339b8c630300dc3960eb35')) originals(signature,expected);
-- The retained overload collides with the fourth argument's default. Rename
-- only the three-argument entry in this transaction to exercise its exact OID,
-- ACL and body without changing either overload or its defaults.
alter function public.pause_session_for_break(uuid,timestamptz,integer)
 rename to pause_session_for_break_scoping_fixture;
update writer_calls set statement=replace(statement,'public.pause_session_for_break(',
 'public.pause_session_for_break_scoping_fixture(')
 where signature='public.pause_session_for_break(uuid,timestamptz,integer)';
select is(pg_temp.call_as(role_name,actor,statement),'42501',label||' denied: '||signature)
 from writer_calls cross join (values
 ('anon',null::uuid,'anonymous'),('authenticated',null::uuid,'subject-less'),
 ('authenticated',pg_temp.fid(90802),'other user'),('authenticated',pg_temp.fid(90801),'self browser')) callers(role_name,actor,label);
select is(pg_temp.call_as('service_role',null,statement),'ok','service behavior retained: '||signature) from writer_calls;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select is(public.update_time_tracking_session_with_bypass(pg_temp.fid(90821),'{"title":"Synthetic service edit"}'),pg_temp.fid(90821),'service update returns the requested session');
select is((select title from public.time_tracking_sessions where id=pg_temp.fid(90821)),'Synthetic service edit','service update persists title');
select is((public.pause_session_for_break_scoping_fixture(pg_temp.fid(90821),now(),600)::jsonb)->>'is_running','false','three-argument pause stops the session');
select is((public.pause_session_for_break(pg_temp.fid(90821),now(),600,true)::jsonb)->>'pending_approval','true','four-argument pause preserves pending approval');
select public.insert_time_tracking_session_with_bypass(pg_temp.fid(90811),pg_temp.fid(90801),'Synthetic service insert',p_start_time=>now()-interval '2 minutes',p_end_time=>now(),p_is_running=>false);
select ok(exists(select 1 from public.time_tracking_sessions where ws_id=pg_temp.fid(90811) and user_id=pg_temp.fid(90801) and title='Synthetic service insert'),'service insert persists the scoped session');
select is(jsonb_array_length(public.get_workspace_time_tracking_stats(pg_temp.fid(90811))->'members'),1,'service workspace stats retain the member list');
reset role;
select set_config('request.jwt.claims','{}',true);

create function pg_temp.personal(actor uuid) returns uuid language sql as $$
 select w.id from public.workspaces w join public.workspace_members m on m.ws_id=w.id
 where w.personal and m.user_id=actor limit 1;
$$;
select ok(pg_temp.personal(pg_temp.fid(90801)) is not null and pg_temp.personal(pg_temp.fid(90802)) is not null,'both personal fixtures exist');
insert into public.workspace_boards(id,ws_id,name,creator_id) values
 (pg_temp.fid(90841),pg_temp.personal(pg_temp.fid(90801)),'Synthetic own board',pg_temp.fid(90801)),
 (pg_temp.fid(90842),pg_temp.personal(pg_temp.fid(90802)),'Synthetic other board',pg_temp.fid(90802));
insert into public.task_lists(id,board_id,name) values
 (pg_temp.fid(90851),pg_temp.fid(90841),'Synthetic own list'),
 (pg_temp.fid(90852),pg_temp.fid(90842),'Synthetic other list');
insert into public.tasks(id,list_id,name,creator_id) values
 (pg_temp.fid(90861),pg_temp.fid(90851),'Synthetic own task',pg_temp.fid(90801)),
 (pg_temp.fid(90862),pg_temp.fid(90852),'Synthetic other task',pg_temp.fid(90802));
create temporary table readers(name text, signature text);
insert into readers values
 ('get_user_accessible_tasks','public.get_user_accessible_tasks(uuid,uuid,boolean,public.task_board_status[],boolean,boolean)'),
 ('get_user_tasks_with_relations','public.get_user_tasks_with_relations(uuid,uuid,boolean,public.task_board_status[],boolean,boolean,uuid[],uuid[],uuid[],uuid[],boolean)');
select ok(not has_function_privilege('anon',signature,'EXECUTE'),'anon denied '||name) from readers;
select ok(has_function_privilege(role_name,signature,'EXECUTE'),role_name||' retained '||name)
 from readers cross join unnest(array['authenticated','service_role']) role_name;
select ok((select proconfig @> array['search_path=pg_catalog, pg_temp'] from pg_proc where oid=signature::regprocedure),'fixed path '||name) from readers;
select is(pg_temp.call_as(role_name,actor,format('select * from public.%I(%L)',name,pg_temp.fid(90801))),'42501',label||' denied '||name)
 from readers cross join (values ('anon',null::uuid,'anon'),('authenticated',null::uuid,'no subject'),('authenticated',pg_temp.fid(90802),'other user')) callers(role_name,actor,label);
select is(pg_temp.call_as('service_role',null,format('select * from public.%I(%L)',name,pg_temp.fid(90801))),'ok','service context retained '||name) from readers;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.fid(90801))::text,true);
set local role authenticated;
select is((select array_agg(task_id order by task_id) from public.get_user_accessible_tasks(pg_temp.fid(90801))),array[pg_temp.fid(90861)],'self accessible task result remains exact');
select is((select array_agg(task_id order by task_id) from public.get_user_tasks_with_relations(pg_temp.fid(90801))),array[pg_temp.fid(90861)],'self task relations remain exact');
reset role;
select set_config('request.jwt.claims','{}',true);
select * from finish();
rollback;
