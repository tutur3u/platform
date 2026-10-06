begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into auth.users(id) values(pg_temp.fid(90501)),(pg_temp.fid(90502)),(pg_temp.fid(90503)),(pg_temp.fid(90504));
insert into public.users(id) values(pg_temp.fid(90501)),(pg_temp.fid(90502)),(pg_temp.fid(90503)),(pg_temp.fid(90504)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
  (pg_temp.fid(90511),'Synthetic control scope',false,pg_temp.fid(90501)),
  (pg_temp.fid(90512),'Synthetic foreign scope',false,pg_temp.fid(90502));
insert into public.workspace_members(ws_id,user_id,type) values
  (pg_temp.fid(90511),pg_temp.fid(90501),'MEMBER'),
  (pg_temp.fid(90512),pg_temp.fid(90502),'MEMBER'),
  (pg_temp.fid(90511),pg_temp.fid(90502),'MEMBER'),
  (pg_temp.fid(90512),pg_temp.fid(90501),'MEMBER'),
  (pg_temp.fid(90511),pg_temp.fid(90503),'GUEST') on conflict do nothing;
insert into public.time_tracking_sessions(id,ws_id,user_id,title,start_time,end_time,is_running) values
  (pg_temp.fid(90521),pg_temp.fid(90511),pg_temp.fid(90501),'Synthetic own session',now()-interval '10 minutes',now(),false),
  (pg_temp.fid(90522),pg_temp.fid(90512),pg_temp.fid(90502),'Synthetic foreign session',now()-interval '10 minutes',now(),false),
  (pg_temp.fid(90523),pg_temp.fid(90511),pg_temp.fid(90502),'Synthetic other actor',now()-interval '10 minutes',now(),false),
  (pg_temp.fid(90524),pg_temp.fid(90512),pg_temp.fid(90501),'Synthetic other workspace',now()-interval '10 minutes',now(),false);
create temp table unchanged_sessions as select jsonb_agg(to_jsonb(s) order by id) as snapshot
  from public.time_tracking_sessions s where id in(pg_temp.fid(90521),pg_temp.fid(90522),pg_temp.fid(90523),pg_temp.fid(90524));
create function pg_temp.config() returns jsonb language sql as $$ select
  '{"focus_minutes":25,"short_break_minutes":5,"long_break_minutes":15,"sessions_until_long_break":4,"auto_start_breaks":false,"auto_start_focus":false}'::jsonb;
$$;
create function pg_temp.configure(rev bigint, cmd integer, config jsonb default pg_temp.config(), session uuid default null)
returns jsonb language sql as $$ select private.configure_time_tracker_control(
  pg_temp.fid(90511),pg_temp.fid(90501),rev,pg_temp.fid(cmd),config,session);
$$;
select ok((select relrowsecurity from pg_class where oid='private.time_tracker_controls'::regclass),'control enables RLS');
select ok(not has_table_privilege('anon','private.time_tracker_controls','SELECT'),'anonymous cannot read controls');
select ok(not has_table_privilege('authenticated','private.time_tracker_controls','SELECT'),'browser cannot read controls');
select ok(not has_table_privilege('authenticated','private.time_tracker_controls','INSERT,UPDATE,DELETE'),'browser cannot mutate controls');
select ok(not has_table_privilege('service_role','private.time_tracker_controls','INSERT,UPDATE,DELETE'),'server cannot bypass CAS with direct mutation');
select ok(not has_function_privilege('authenticated','private.configure_time_tracker_control(uuid,uuid,bigint,uuid,jsonb,uuid)','EXECUTE'),'browser cannot invoke configure');
select ok(not has_function_privilege('anon','private.read_time_tracker_control(uuid,uuid)','EXECUTE'),'anonymous cannot invoke read');
select ok(has_function_privilege('service_role','private.configure_time_tracker_control(uuid,uuid,bigint,uuid,jsonb,uuid)','EXECUTE'),'trusted server can invoke configure');
select is(private.read_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90501)),null::jsonb,'missing authorized control reads as null');
select is((pg_temp.configure(0,90531)->>'revision')::bigint,1::bigint,'initialize starts at revision one');
select is((pg_temp.configure(0,90531)->>'revision')::bigint,1::bigint,'same initialize command replays without increment');
select is((private.read_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90501))->>'mode'),'off','initial mode is off');
select is((private.read_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90501))->>'phase'),'idle','initial phase is idle');
select is((private.read_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90501))->>'deadline_at'),null::text,'initial deadline is absent');
select ok(not(private.read_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90501)) ? 'last_command_payload'),'read excludes internal command payload');
select throws_ok($q$select pg_temp.configure(0,90532)$q$,'40001','Control revision conflict','new stale initialize command rejected');
select throws_ok($q$select pg_temp.configure(0,90531,jsonb_set(pg_temp.config(),'{focus_minutes}','30'))$q$,'40001','Control command conflict','same command with changed payload rejected');
select is((pg_temp.configure(1,90532,jsonb_set(pg_temp.config(),'{focus_minutes}','30'),pg_temp.fid(90521))->>'revision')::bigint,2::bigint,'CAS config update increments once');
select is((pg_temp.configure(1,90532,jsonb_set(pg_temp.config(),'{focus_minutes}','30'),pg_temp.fid(90521))->>'revision')::bigint,2::bigint,'same latest update replays at same revision');
select throws_ok($q$select pg_temp.configure(1,90533)$q$,'40001','Control revision conflict','old revision cannot overwrite newer config');
select throws_ok($q$select pg_temp.configure(2,90534,pg_temp.config(),pg_temp.fid(90522))$q$,'22023','Prepared session unavailable','foreign actor/workspace session rejected');
select is((private.read_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90501))->>'revision')::bigint,2::bigint,'failed session check leaves revision unchanged');
select throws_ok($q$select private.configure_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90504),0,pg_temp.fid(90535),pg_temp.config())$q$,'42501','Insufficient permissions','nonmember cannot initialize');
select throws_ok($q$select private.configure_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90503),0,pg_temp.fid(90535),pg_temp.config())$q$,'42501','Insufficient permissions','GUEST cannot initialize');
select throws_ok($q$select private.read_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90503))$q$,'42501','Insufficient permissions','GUEST read denied');
select is(private.read_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90502)),null::jsonb,'other member never reads actor control');
select throws_ok($q$select pg_temp.configure(2,90538,pg_temp.config(),pg_temp.fid(90523))$q$,'22023','Prepared session unavailable','same workspace other actor session rejected');
select throws_ok($q$select pg_temp.configure(2,90539,pg_temp.config(),pg_temp.fid(90524))$q$,'22023','Prepared session unavailable','same actor other workspace session rejected');
select throws_ok($q$select pg_temp.configure(2,90536,jsonb_set(pg_temp.config(),'{focus_minutes}','25.5'))$q$,'22023','Invalid control configuration','fractional duration rejected');
select throws_ok($q$select pg_temp.configure(2,90536,jsonb_set(pg_temp.config(),'{focus_minutes}','0'))$q$,'22023','Invalid control configuration','zero duration rejected');
select throws_ok($q$select pg_temp.configure(2,90536,jsonb_set(pg_temp.config(),'{focus_minutes}','181'))$q$,'22023','Invalid control configuration','duration bound enforced');
select throws_ok($q$select pg_temp.configure(2,90536,pg_temp.config()-'auto_start_focus')$q$,'22023','Invalid control configuration','incomplete config rejected');
select throws_ok($q$select pg_temp.configure(2,90536,pg_temp.config()||'{"phase":"running"}')$q$,'22023','Invalid control configuration','unknown config fields rejected');
select throws_ok($q$update private.time_tracker_controls set mode='pomodoro' where ws_id=pg_temp.fid(90511)$q$,'23514',null,'even privileged table writes cannot activate mode');
select throws_ok($q$update private.time_tracker_controls set deadline_at=now() where ws_id=pg_temp.fid(90511)$q$,'23514',null,'deadline activation blocked by table constraint');
-- A transaction failure after actual CAS must roll back its configuration/revision.
create function pg_temp.failed_update() returns void language plpgsql as $$ begin
  perform pg_temp.configure(2,90537);
  raise exception 'Synthetic downstream failure' using errcode='P0001';
end; $$;
select throws_ok($q$select pg_temp.failed_update()$q$,'P0001','Synthetic downstream failure','downstream failure remains a failure');
select is((private.read_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90501))->>'revision')::bigint,2::bigint,'failed transaction rolls back revision');
select is((private.read_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90501))->'config'->>'focus_minutes'),'30','failed transaction preserves prior config');
select is((select jsonb_agg(to_jsonb(s) order by id) from public.time_tracking_sessions s where id in(pg_temp.fid(90521),pg_temp.fid(90522),pg_temp.fid(90523),pg_temp.fid(90524))),(select snapshot from unchanged_sessions),'configuration leaves all tracker accounting unchanged');
delete from public.time_tracking_sessions where id=pg_temp.fid(90521);
select is((private.read_time_tracker_control(pg_temp.fid(90511),pg_temp.fid(90501))->>'mode'),'off','existing session deletion stays possible and control stays inert');
select * from finish();
rollback;
