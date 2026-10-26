begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql as $$
 select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into auth.users(id) values(pg_temp.fid(90801)),(pg_temp.fid(90802)),(pg_temp.fid(90803));
insert into public.users(id) values(pg_temp.fid(90801)),(pg_temp.fid(90802)),(pg_temp.fid(90803)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
 (pg_temp.fid(90811),'Synthetic Pomodoro scope',false,pg_temp.fid(90801)),
 (pg_temp.fid(90812),'Synthetic foreign Pomodoro scope',false,pg_temp.fid(90802));
insert into public.workspace_members(ws_id,user_id,type) values(pg_temp.fid(90811),pg_temp.fid(90802),'GUEST');
create function pg_temp.config() returns jsonb language sql as $$ select
 '{"focus_minutes":25,"short_break_minutes":5,"long_break_minutes":15,"sessions_until_long_break":4,"auto_start_breaks":true,"auto_start_focus":true}'::jsonb;
$$;
select private.configure_time_tracker_control(pg_temp.fid(90811),pg_temp.fid(90801),0,pg_temp.fid(90830),pg_temp.config());
create function pg_temp.rev() returns bigint language sql as $$
 select revision from private.time_tracker_controls where ws_id=pg_temp.fid(90811) and actor_id=pg_temp.fid(90801);
$$;
create function pg_temp.prepared() returns uuid language sql as $$
 select prepared_session_id from private.time_tracker_controls where ws_id=pg_temp.fid(90811) and actor_id=pg_temp.fid(90801);
$$;
create function pg_temp.state(phase text,minutes numeric,remaining integer,completed integer default 0) returns jsonb language sql as $$
 select jsonb_build_object('phase',phase,
  'deadlineAt',case when minutes is null then null else clock_timestamp()+make_interval(secs=>minutes*60) end,
  'remainingMs',remaining,'completedFocus',completed,'taskId',null,
  'title',case when phase='idle' then null else 'Write' end);
$$;
create function pg_temp.cmd(rev bigint,n integer,command jsonb,next jsonb,effects jsonb) returns jsonb language sql as $$
 select private.command_time_tracker_pomodoro(pg_temp.fid(90811),pg_temp.fid(90801),rev,pg_temp.fid(n),command,next,effects);
$$;
create function pg_temp.start(n integer) returns jsonb language sql as $$
 select pg_temp.cmd(pg_temp.rev(),n,'{"type":"start","title":"Write"}',pg_temp.state('focus',25,1500000),
  '[{"kind":"start","title":"Write","taskId":null,"tags":["pomodoro"]}]');
$$;
create function pg_temp.effect(kind text,extra jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('kind',kind,'sessionId',pg_temp.prepared())||extra);
$$;
create function pg_temp.running() returns bigint language sql as $$
 select count(*) from public.time_tracking_sessions where ws_id=pg_temp.fid(90811) and user_id=pg_temp.fid(90801) and is_running;
$$;
create function pg_temp.sessions() returns bigint language sql as $$
 select count(*) from public.time_tracking_sessions where ws_id=pg_temp.fid(90811) and user_id=pg_temp.fid(90801);
$$;

-- Grants and admission.
select ok(not has_function_privilege('anon','private.command_time_tracker_pomodoro(uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb)','EXECUTE'),'anonymous cannot command');
select ok(not has_function_privilege('authenticated','private.command_time_tracker_pomodoro(uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb)','EXECUTE'),'browser cannot command');
select ok(has_function_privilege('service_role','private.command_time_tracker_pomodoro(uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb)','EXECUTE'),'service commands through admission');
select ok((select prosecdef and proconfig @> array['search_path=pg_catalog, pg_temp'] from pg_proc where oid='private.command_time_tracker_pomodoro(uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb)'::regprocedure),'command definer uses the hardened path');
select ok((select bool_and(not has_function_privilege(r,f,'EXECUTE')) from unnest(array['anon','authenticated','service_role']) r
 cross join unnest(array['private._replace_running_session_locked(uuid,uuid,uuid,text,text,uuid,uuid,text[],boolean)',
  'private._lock_time_tracker_actor_rows(uuid,uuid)']) f),'locked helpers are not callable by any API role');
select ok((select bool_and(not prosecdef) from pg_proc where oid in('private._replace_running_session_locked(uuid,uuid,uuid,text,text,uuid,uuid,text[],boolean)'::regprocedure,
 'private._lock_time_tracker_actor_rows(uuid,uuid)'::regprocedure)),'locked helpers run as their definer caller, not as definers');
select throws_ok($q$select private.command_time_tracker_pomodoro(pg_temp.fid(90811),pg_temp.fid(90802),1,pg_temp.fid(90831),'{"type":"stop"}',pg_temp.state('idle',null,0),'[]')$q$,'42501','Insufficient permissions','GUEST denied');
select throws_ok($q$select private.command_time_tracker_pomodoro(pg_temp.fid(90811),pg_temp.fid(90803),1,pg_temp.fid(90831),'{"type":"stop"}',pg_temp.state('idle',null,0),'[]')$q$,'42501','Insufficient permissions','nonmember denied');
insert into public.workspace_members(ws_id,user_id,type) values(pg_temp.fid(90812),pg_temp.fid(90801),'MEMBER');
select throws_ok($q$select private.command_time_tracker_pomodoro(pg_temp.fid(90812),pg_temp.fid(90801),1,pg_temp.fid(90831),'{"type":"stop"}',pg_temp.state('idle',null,0),'[]')$q$,'55000','Pomodoro control not configured','member without a control denied');
select throws_ok($q$select pg_temp.cmd(0,90831,'{"type":"stop"}',pg_temp.state('idle',null,0),'[]')$q$,'22023','Invalid Pomodoro command','revision zero rejected');
select throws_ok($q$select pg_temp.cmd(1,90831,'{"type":"wake"}',pg_temp.state('idle',null,0),'[]')$q$,'22023','Invalid Pomodoro command','unknown command rejected');
select throws_ok($q$select pg_temp.cmd(1,90831,'{"type":"start","title":"Write"}',pg_temp.state('focus',600,1500000),'[]')$q$,'22023','Invalid Pomodoro state','deadline beyond any phase rejected');
select throws_ok($q$select pg_temp.cmd(1,90831,'{"type":"start","title":"Write"}',pg_temp.state('nap',null,0),'[]')$q$,'22023','Invalid Pomodoro state','unknown phase rejected');
select throws_ok($q$select pg_temp.cmd(1,90831,'{"type":"pause"}',pg_temp.state('focus',null,1),jsonb_build_array(jsonb_build_object('kind','pause','sessionId',gen_random_uuid())))$q$,'22023','Pomodoro effect targets another session','effects never target a foreign session');
select is(pg_temp.rev(),1::bigint,'rejected commands leave the revision');

-- Start, replay, CAS.
create temp table applied(n integer primary key,result jsonb);
insert into applied values(1,pg_temp.start(90831));
select is((select result->>'mode'||'/'||(result->>'phase') from applied where n=1),'pomodoro/focus','start runs a focus phase');
select is(pg_temp.rev(),2::bigint,'start bumps the revision');
select is((select tags from public.time_tracking_sessions where id=pg_temp.prepared()),array['pomodoro']::text[],'focus session is tagged pomodoro');
select is((select is_running from public.time_tracking_sessions where id=pg_temp.prepared()),true,'focus session runs');
select is(pg_temp.cmd(1,90831,'{"type":"start","title":"Write"}',pg_temp.state('focus',25,1500000),'[]')-'replayed',
 (select result-'replayed' from applied where n=1),'same id and payload replays the applied result');
select is((pg_temp.cmd(1,90831,'{"type":"start","title":"Write"}','{}','[]')->>'replayed')::boolean,true,'replay is marked and ignores a new plan');
select is(pg_temp.sessions(),1::bigint,'replay starts nothing');
select throws_ok($q$select pg_temp.cmd(1,90831,'{"type":"start","title":"Other"}',pg_temp.state('focus',25,1500000),'[]')$q$,'40001','Pomodoro command conflict','reused id with a new payload conflicts');
select throws_ok($q$select pg_temp.cmd(1,90832,'{"type":"stop"}',pg_temp.state('idle',null,0),'[]')$q$,'40001','Pomodoro revision conflict','stale revision conflicts');
select throws_ok($q$select private.replace_running_time_tracker_session(pg_temp.fid(90811),pg_temp.fid(90801),0,null,pg_temp.fid(90833),'Manual',null,null,null)$q$,'55000','OFF control required','the Timer replace path still requires OFF');

-- Configuring keeps the running focus session.
create temp table kept(id uuid);
insert into kept select pg_temp.prepared();
select private.configure_time_tracker_control(pg_temp.fid(90811),pg_temp.fid(90801),pg_temp.rev(),pg_temp.fid(90834),pg_temp.config());
select is(pg_temp.prepared(),(select id from kept),'configure keeps the Pomodoro focus session');

-- Pause and resume through break rows.
select pg_temp.cmd(pg_temp.rev(),90835,'{"type":"pause"}',pg_temp.state('focus',null,600000),pg_temp.effect('pause'));
select is((select is_running from public.time_tracking_sessions where id=pg_temp.prepared()),false,'pause stops the focus session');
select is((select count(*) from public.time_tracking_breaks where session_id=pg_temp.prepared() and break_end is null and break_type_name='Pomodoro'),1::bigint,'pause opens one break');
select is((select deadline_at from private.time_tracker_controls where ws_id=pg_temp.fid(90811) and actor_id=pg_temp.fid(90801)),null,'paused phase has no deadline');
select pg_temp.cmd(pg_temp.rev(),90836,'{"type":"resume"}',pg_temp.state('focus',10,600000),pg_temp.effect('resume'));
select is((select count(*) from public.time_tracking_breaks where session_id=(select id from kept) and break_end is null),0::bigint,'resume closes the break');
select is((select parent_session_id from public.time_tracking_sessions where id=pg_temp.prepared()),(select id from kept),'resume continues the chain');
select is((select tags from public.time_tracking_sessions where id=pg_temp.prepared()),array['pomodoro']::text[],'resumed session keeps the tag');
select is(pg_temp.running(),1::bigint,'one running session after resume');

-- A resume made elsewhere is followed; stop closes the current link.
update kept set id=pg_temp.prepared();
set local time_tracking.bypass_update_limit='on';
update public.time_tracking_sessions set is_running=false,end_time=clock_timestamp() where id=(select id from kept);
insert into public.time_tracking_sessions(ws_id,user_id,title,start_time,is_running,was_resumed,parent_session_id,tags)
 values(pg_temp.fid(90811),pg_temp.fid(90801),'Write',clock_timestamp(),true,true,(select id from kept),array['pomodoro']);
set local time_tracking.bypass_update_limit='off';
select pg_temp.cmd(pg_temp.rev(),90837,'{"type":"stop"}',pg_temp.state('idle',null,0),pg_temp.effect('stop',jsonb_build_object('trimToIfAfterStart',null)));
select is(pg_temp.running(),0::bigint,'stop closes the session resumed elsewhere');
select is((select mode||'/'||phase||'/'||coalesce(prepared_session_id::text,'-') from private.time_tracker_controls where ws_id=pg_temp.fid(90811) and actor_id=pg_temp.fid(90801)),'off/idle/-','stop returns the control to OFF');

-- Late stops trim to the deadline only when it is after the session start.
select pg_temp.start(90838);
set local time_tracking.bypass_update_limit='on';
update public.time_tracking_sessions set start_time=clock_timestamp()-interval '30 minutes' where id=pg_temp.prepared();
set local time_tracking.bypass_update_limit='off';
update kept set id=pg_temp.prepared();
create temp table deadline(at timestamptz);
insert into deadline values(clock_timestamp()-interval '5 minutes');
select pg_temp.cmd(pg_temp.rev(),90839,'{"type":"skip"}',pg_temp.state('short_break',5,300000),
 pg_temp.effect('stop',jsonb_build_object('trimToIfAfterStart',(select at from deadline))));
select is((select end_time from public.time_tracking_sessions where id=(select id from kept)),(select at from deadline),'late focus ends at its deadline');
select is((select prepared_session_id from private.time_tracker_controls where ws_id=pg_temp.fid(90811) and actor_id=pg_temp.fid(90801)),null,'breaks hold no session');

-- No server path starts focus: a break ended by reconcile leaves focus waiting.
select pg_temp.cmd(pg_temp.rev(),90840,'{"type":"reconcile"}',pg_temp.state('focus',null,1500000,1),'[]');
select is(pg_temp.running(),0::bigint,'reconcile starts no session');
select is((select phase||'/'||coalesce(deadline_at::text,'waiting') from private.time_tracker_controls where ws_id=pg_temp.fid(90811) and actor_id=pg_temp.fid(90801)),'focus/waiting','focus waits for the user');
select pg_temp.cmd(pg_temp.rev(),90841,'{"type":"stop"}',pg_temp.state('idle',null,0),'[]');

select pg_temp.start(90842);
set local time_tracking.bypass_update_limit='on';
update public.time_tracking_sessions set start_time=clock_timestamp()-interval '10 minutes' where id=pg_temp.prepared();
set local time_tracking.bypass_update_limit='off';
update kept set id=pg_temp.prepared();
select pg_temp.cmd(pg_temp.rev(),90843,'{"type":"stop"}',pg_temp.state('idle',null,0),
 pg_temp.effect('stop',jsonb_build_object('trimToIfAfterStart',clock_timestamp()-interval '20 minutes')));
select ok((select end_time>start_time from public.time_tracking_sessions where id=(select id from kept)),'no trim before the session start');

-- A focus session ended elsewhere turns the Pomodoro OFF on pause.
select pg_temp.start(90844);
set local time_tracking.bypass_update_limit='on';
update public.time_tracking_sessions set is_running=false,end_time=clock_timestamp() where id=pg_temp.prepared();
set local time_tracking.bypass_update_limit='off';
select is((pg_temp.cmd(pg_temp.rev(),90845,'{"type":"pause"}',pg_temp.state('focus',null,600000),pg_temp.effect('pause'))->>'mismatch')::boolean,true,'pause of a session ended elsewhere reports a mismatch');
select is((select mode from private.time_tracker_controls where ws_id=pg_temp.fid(90811) and actor_id=pg_temp.fid(90801)),'off','mismatch turns the Pomodoro OFF');
select is((select count(*) from public.time_tracking_breaks b join public.time_tracking_sessions s on s.id=b.session_id where s.ws_id=pg_temp.fid(90811) and b.break_end is null),0::bigint,'mismatch opens no break');

-- A manual timer is never closed: a running one conflicts, a paused one stays.
insert into public.time_tracking_sessions(ws_id,user_id,title,start_time,is_running)
 values(pg_temp.fid(90811),pg_temp.fid(90801),'Manual',clock_timestamp(),true);
update kept set id=(select id from public.time_tracking_sessions where ws_id=pg_temp.fid(90811) and user_id=pg_temp.fid(90801) and is_running);
select throws_ok($q$select pg_temp.start(90846)$q$,'40001','Timer running session conflict','start refuses while a manual timer runs');
select is((select is_running from public.time_tracking_sessions where id=(select id from kept)),true,'manual timer keeps running');
set local time_tracking.bypass_update_limit='on';
update public.time_tracking_sessions set is_running=false,end_time=clock_timestamp() where id=(select id from kept);
set local time_tracking.bypass_update_limit='off';
insert into public.time_tracking_breaks(session_id,break_type_name,break_start,created_by)
 values((select id from kept),'Lunch',clock_timestamp(),pg_temp.fid(90801));
select pg_temp.start(90847);
select is((select count(*) from public.time_tracking_breaks where session_id=(select id from kept) and break_end is null),1::bigint,'a paused manual timer keeps its break');
select is(pg_temp.running(),1::bigint,'focus runs beside the paused manual timer');

-- Shape constraint.
select throws_ok($q$update private.time_tracker_controls set mode='pomodoro',phase='idle' where ws_id=pg_temp.fid(90811)$q$,'23514',null,'POMODORO cannot be idle');
select throws_ok($q$update private.time_tracker_controls set mode='off',phase='idle',deadline_at=null,remaining_ms=0,completed_focus=0,task_id=null,prepared_session_id=null where ws_id=pg_temp.fid(90811)$q$,'23514',null,'OFF cannot keep a title');

-- Realtime topic.
select is(private.cloudflare_channel_role(pg_temp.fid(90801),'time-tracker-pomodoro-'||pg_temp.fid(90811)||'-'||pg_temp.fid(90801)),'editor','actor joins their own topic');
select is(private.cloudflare_channel_role(pg_temp.fid(90801),'time-tracker-pomodoro-'||pg_temp.fid(90811)||'-'||pg_temp.fid(90802)),null,'no one joins another actor''s topic');
select is(private.cloudflare_channel_role(pg_temp.fid(90802),'time-tracker-pomodoro-'||pg_temp.fid(90811)||'-'||pg_temp.fid(90802)),null,'GUEST cannot join');
select is(private.cloudflare_channel_role(pg_temp.fid(90803),'time-tracker-pomodoro-'||pg_temp.fid(90811)||'-'||pg_temp.fid(90803)),null,'nonmember cannot join');
select is(private.cloudflare_channel_role(pg_temp.fid(90801),'time-tracker-pomodoro-'||repeat('-',36)||'-'||pg_temp.fid(90801)),null,'malformed id denied');
select is(private.cloudflare_channel_role(pg_temp.fid(90801),'task-user-realtime-'||pg_temp.fid(90801)),'editor','existing topics unchanged');

select * from finish();
rollback;
