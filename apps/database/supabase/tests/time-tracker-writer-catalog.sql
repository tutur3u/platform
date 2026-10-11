begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select is((select n.nspname::text from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'),'extensions','hash implementation has an explicit resolved namespace');
select ok((select relrowsecurity from pg_class where oid='public.time_tracking_sessions'::regclass),'session RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.time_tracking_breaks'::regclass),'break RLS enabled');
select ok((select relrowsecurity from pg_class where oid='private.time_tracker_operation_scopes'::regclass),'operation RLS enabled');
select ok((select relrowsecurity from pg_class where oid='private.time_tracker_operation_receipts'::regclass),'receipt RLS enabled');
-- These known legacy entries leave closure OPEN; unknown drift fails this fixture.
select is((select array_agg(n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' order by n.nspname,p.proname,oidvectortypes(p.proargtypes))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in('public','private') and p.prokind='f'
 and lower(replace(p.prosrc,'"','')) ~ '(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(public\.)?time_tracking_sessions([[:space:](]|$)'),
 array['private.handle_request_status_change()',
 'private.replace_running_time_tracker_session(uuid, uuid, bigint, uuid, uuid, text, text, uuid, uuid)',
 'private.update_time_tracking_request(uuid, text, uuid, uuid, text, text)',
 'public.insert_time_tracking_session_bypassed(uuid, uuid, text, text, timestamp with time zone, timestamp with time zone, integer, uuid, uuid)',
 'public.insert_time_tracking_session_with_bypass(uuid, uuid, text, text, uuid, uuid, timestamp with time zone, timestamp with time zone, integer, boolean)',
 'public.pause_session_for_break(uuid, timestamp with time zone, integer)',
 'public.pause_session_for_break(uuid, timestamp with time zone, integer, boolean)',
 'public.stop_other_running_sessions()',
 'public.update_time_tracking_session_bypassed(uuid, timestamp with time zone, timestamp with time zone, text)',
 'public.update_time_tracking_session_with_bypass(uuid, jsonb)']::text[],
 'static session writer EXACT signatures include both retained pause overloads; unknown overload fails');
select is((select array_agg(c.relname||':'||t.tgname order by c.relname,t.tgname)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid
 where not t.tgisinternal and t.tgrelid in('public.time_tracking_sessions'::regclass,'public.time_tracking_breaks'::regclass,'private.time_tracking_requests'::regclass)),
 array['time_tracking_breaks:enforce_strict_text_field_limits','time_tracking_breaks:time_tracking_breaks_duration_trigger','time_tracking_breaks:time_tracking_breaks_updated_at_trigger',
 'time_tracking_requests:enforce_strict_text_field_limits','time_tracking_requests:enforce_time_tracking_request_update','time_tracking_requests:trg_notify_time_tracking_request_status_change',
 'time_tracking_requests:trg_notify_time_tracking_request_submitted','time_tracking_requests:trigger_handle_request_status_change',
 'time_tracking_requests:trigger_log_request_creation','time_tracking_requests:trigger_log_request_update',
 'time_tracking_sessions:enforce_strict_text_field_limits','time_tracking_sessions:enforce_time_tracking_insert','time_tracking_sessions:enforce_time_tracking_session_task_workspace_trigger',
 'time_tracking_sessions:enforce_time_tracking_update','time_tracking_sessions:stop_other_running_sessions_trigger',
 'time_tracking_sessions:update_productivity_score_trigger','time_tracking_sessions:update_session_duration_trigger']::text[],
 'trigger allowlist includes task guard, accounting, request activity and notifications');
-- tgtype includes ROW/BEFORE/INSERT/UPDATE bits; mapping is exact, not only a name.
select is((select array_agg(c.relname||':'||t.tgname||':'||t.tgtype||':'||n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' order by c.relname,t.tgname)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace
 where not t.tgisinternal and t.tgrelid in('public.time_tracking_sessions'::regclass,'public.time_tracking_breaks'::regclass,'private.time_tracking_requests'::regclass)),
 array[
 'time_tracking_breaks:enforce_strict_text_field_limits:23:public.enforce_strict_text_field_limits()',
 'time_tracking_breaks:time_tracking_breaks_duration_trigger:23:public.calculate_time_tracking_break_duration()',
 'time_tracking_breaks:time_tracking_breaks_updated_at_trigger:19:public.update_time_tracking_breaks_updated_at()',
 'time_tracking_requests:enforce_strict_text_field_limits:23:public.enforce_strict_text_field_limits()',
 'time_tracking_requests:enforce_time_tracking_request_update:19:private.check_time_tracking_request_update()',
 'time_tracking_requests:trg_notify_time_tracking_request_status_change:17:private.notify_time_tracking_request_status_change()',
 'time_tracking_requests:trg_notify_time_tracking_request_submitted:5:private.notify_time_tracking_request_submitted()',
 'time_tracking_requests:trigger_handle_request_status_change:19:private.handle_request_status_change()',
 'time_tracking_requests:trigger_log_request_creation:5:private.log_time_tracking_request_creation()',
 'time_tracking_requests:trigger_log_request_update:17:private.log_time_tracking_request_update()',
 'time_tracking_sessions:enforce_strict_text_field_limits:23:public.enforce_strict_text_field_limits()',
 'time_tracking_sessions:enforce_time_tracking_insert:7:public.check_time_tracking_session_insert()',
 'time_tracking_sessions:enforce_time_tracking_session_task_workspace_trigger:23:public.enforce_time_tracking_session_task_workspace()',
 'time_tracking_sessions:enforce_time_tracking_update:19:public.check_time_tracking_session_update()',
 'time_tracking_sessions:stop_other_running_sessions_trigger:21:public.stop_other_running_sessions()',
 'time_tracking_sessions:update_productivity_score_trigger:23:public.update_productivity_score()',
 'time_tracking_sessions:update_session_duration_trigger:19:public.update_session_duration()']::text[],
 'changed trigger timing/event/function mapping fails catalog contract');
select is((select string_agg(a.attname,',' order by key.ordinality) from pg_trigger t
 cross join lateral unnest(t.tgattr::smallint[]) with ordinality key(attnum,ordinality)
 join pg_attribute a on a.attrelid=t.tgrelid and a.attnum=key.attnum
 where t.tgrelid='public.time_tracking_sessions'::regclass and t.tgname='enforce_time_tracking_session_task_workspace_trigger'),
 'task_id,ws_id','task guard UPDATE OF columns are exact');
select ok(not exists(select 1 from pg_trigger where not tgisinternal
 and tgrelid in('public.time_tracking_sessions'::regclass,'public.time_tracking_breaks'::regclass,'private.time_tracking_requests'::regclass)
 and tgname<>'enforce_time_tracking_session_task_workspace_trigger' and cardinality(tgattr::smallint[])>0),'no unexpected UPDATE OF narrowing on other triggers');
select ok(not exists(select 1 from pg_trigger where not tgisinternal
 and tgrelid in('public.time_tracking_sessions'::regclass,'public.time_tracking_breaks'::regclass,'private.time_tracking_requests'::regclass)
 and tgname<>'trg_notify_time_tracking_request_status_change' and tgqual is not null),'no unexpected conditional trigger weakening');
select is((select regexp_replace(split_part(split_part(pg_get_triggerdef(oid),' WHEN ',2),' EXECUTE FUNCTION ',1),'[[:space:]()]','','g')
 from pg_trigger where tgrelid='private.time_tracking_requests'::regclass and tgname='trg_notify_time_tracking_request_status_change'),
 'old.approval_statusISDISTINCTFROMnew.approval_status','notification status-change predicate is exact');
select ok(not exists(select 1 from pg_trigger where tgrelid in('public.time_tracking_sessions'::regclass,'public.time_tracking_breaks'::regclass,'private.time_tracking_requests'::regclass) and not tgisinternal and tgenabled<>'O'),'legacy triggers remain enabled');
select is((select array_agg(tgname::text order by tgname) from pg_trigger where tgrelid='public.time_tracking_sessions'::regclass and not tgisinternal and (tgtype&2)=2),
 array['enforce_strict_text_field_limits','enforce_time_tracking_insert','enforce_time_tracking_session_task_workspace_trigger','enforce_time_tracking_update','update_productivity_score_trigger','update_session_duration_trigger']::text[],
 'effective BEFORE order is explicit, not silently changed');
select is((select count(*) from pg_constraint where contype='f' and confrelid='public.time_tracking_sessions'::regclass),3::bigint,'session referencing FK inventory is closed to unknown additions');
select is((select confdeltype::text from pg_constraint where contype='f' and conrelid='public.time_tracking_sessions'::regclass and confrelid='public.time_tracking_sessions'::regclass),'n','child chain is SET NULL');
select is((select confdeltype::text from pg_constraint where contype='f' and conrelid='public.time_tracking_breaks'::regclass and confrelid='public.time_tracking_sessions'::regclass),'c','breaks cascade with deleted session');
select is((select confdeltype::text from pg_constraint where contype='f' and conrelid='private.time_tracking_requests'::regclass and confrelid='public.time_tracking_sessions'::regclass),'n','private request link is SET NULL and runs update hooks');
select is((select array_agg(c.conrelid::regclass::text||':'||
 (select string_agg(a.attname,',' order by k.ordinality) from unnest(c.conkey) with ordinality k(attnum,ordinality) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)
 ||'->'||c.confrelid::regclass::text||':'||
 (select string_agg(a.attname,',' order by k.ordinality) from unnest(c.confkey) with ordinality k(attnum,ordinality) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum)
 ||':'||c.confdeltype::text||':'||c.confupdtype::text order by c.conrelid::regclass::text,
 (select string_agg(a.attname,',' order by k.ordinality) from unnest(c.conkey) with ordinality k(attnum,ordinality) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum))
 from pg_constraint c where c.contype='f' and (c.conrelid='public.time_tracking_sessions'::regclass or c.confrelid='public.time_tracking_sessions'::regclass)),
 array['private.time_tracking_requests:linked_session_id->time_tracking_sessions:id:n:a',
 'time_tracking_breaks:session_id->time_tracking_sessions:id:c:a',
 'time_tracking_sessions:category_id->time_tracking_categories:id:n:a',
 'time_tracking_sessions:parent_session_id->time_tracking_sessions:id:n:a',
 'time_tracking_sessions:task_id->tasks:id:n:a',
 'time_tracking_sessions:user_id->users:id:c:a',
 'time_tracking_sessions:ws_id->workspaces:id:c:a']::text[],
 'exact session incoming and outgoing task/category/user/workspace FK columns and actions');
select ok(not exists(select 1 from pg_constraint where contype='f' and
 (conrelid='public.time_tracking_sessions'::regclass or confrelid='public.time_tracking_sessions'::regclass)
 and (condeferrable or not convalidated)),'FK validation and immediate timing unchanged');
-- Resolved body contracts protect canonical accounting, bypass flags and nested effects.
select ok((select prosrc ~ 'EXTRACT\(EPOCH FROM \(NEW.end_time - NEW.start_time\)\)::integer' and prosrc ~ 'NEW.is_running = false' from pg_proc where oid='public.update_session_duration()'::regprocedure),'duration epoch-cast and stopped-state body preserved');
select ok((select prosrc like '%time_tracking.bypass_insert_limit%' from pg_proc where oid='public.check_time_tracking_session_insert()'::regprocedure),'insert policy resolves existing bypass flag');
select ok((select prosrc like '%time_tracking.bypass_update_limit%' from pg_proc where oid='public.check_time_tracking_session_update()'::regprocedure),'update policy resolves existing bypass flag');
select ok((select prosrc like '%time_tracking.is_break_pause%' from pg_proc where oid='public.pause_session_for_break(uuid,timestamptz,integer)'::regprocedure),'retained three-argument pause flag is explicit');
select ok((select prosrc like '%time_tracking.is_break_pause%' from pg_proc where oid='public.pause_session_for_break(uuid,timestamptz,integer,boolean)'::regprocedure),'four-argument pause flag is explicit');
select ok((select prosrc like '%time_tracking.override_auth_uid%' and prosrc like '%time_tracking.bypass_approval_rules%' and lower(prosrc) like '%for update%' from pg_proc where oid='private.update_time_tracking_request(uuid,text,uuid,uuid,text,text)'::regprocedure),'approval actor/bypass/row-lock body flags remain explicit');
select ok((select lower(prosrc) like '%update public.time_tracking_sessions%' and lower(prosrc) like '%delete from public.time_tracking_sessions%' from pg_proc where oid='private.handle_request_status_change()'::regprocedure),'request status still mutates linked sessions');
select ok((select lower(prosrc) like '%insert into private.time_tracking_request_activity%' from pg_proc where oid='private.log_time_tracking_request_update()'::regprocedure),'approval activity nested writer remains present');
select ok((select lower(prosrc) like '%perform public.create_notification%' from pg_proc where oid='private.notify_time_tracking_request_status_change()'::regprocedure),'approval notification nested writer remains present');
-- March hardening removes legacy browser access; September adds only the
-- restrictive MFA guard. Parse its exact declaration as a rollback-only reference.
create temporary table expected_session_policy (id integer) on commit drop;
create policy account_required_mfa on expected_session_policy
 as restrictive for all to authenticated
 using ((select public.account_required_mfa_satisfied()))
 with check ((select public.account_required_mfa_satisfied()));
select ok(not exists(select 1 from pg_policy where polrelid='public.time_tracking_sessions'::regclass and polname='Allow users to delete their own sessions'),'legacy delete-named PUBLIC ALL policy remains absent');
select is((select jsonb_agg(jsonb_build_array(polname,polroles::text,polpermissive,polcmd::text,
 pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) order by polname)::text
 from pg_policy where polrelid='public.time_tracking_sessions'::regclass),
 (select jsonb_agg(jsonb_build_array(polname,polroles::text,polpermissive,polcmd::text,
 pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) order by polname)::text
 from pg_policy where polrelid='pg_temp.expected_session_policy'::regclass),
 'session policy inventory is exactly the restrictive authenticated MFA guard');
select ok(not exists(select 1 from pg_policy where polrelid='public.time_tracking_sessions'::regclass and polname='Allow users to manage their own sessions'),'original manage-all policy absent');
select ok(to_regprocedure('public.update_time_tracking_request(uuid,text,uuid,text,text)') is null,'public approval predecessor absent');
select ok(not has_function_privilege('authenticated','private.update_time_tracking_request(uuid,text,uuid,uuid,text,text)','EXECUTE'),'private approval is not browser-callable');
select ok(has_function_privilege('service_role','private.update_time_tracking_request(uuid,text,uuid,uuid,text,text)','EXECUTE'),'reviewer approval service boundary preserved');
select is((select array_agg(proname::text order by proname) from pg_proc where oid in(
 'public.pause_session_for_break(uuid,timestamptz,integer,boolean)'::regprocedure,
 'public.insert_time_tracking_session_with_bypass(uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,integer,boolean)'::regprocedure,
 'public.update_time_tracking_session_with_bypass(uuid,jsonb)'::regprocedure) and prosecdef),
 array['insert_time_tracking_session_with_bypass','pause_session_for_break','update_time_tracking_session_with_bypass']::text[],'legacy definer writers explicitly retained, not inferred safe');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='private.replace_running_time_tracker_session(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid)'::regprocedure),'new definer uses empty fixed search path');
select ok(not has_function_privilege('anon','private.replace_running_time_tracker_session(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid)','EXECUTE'),'new function inherits no public anonymous grant');
select ok(not has_function_privilege('authenticated','private.replace_running_time_tracker_session(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid)','EXECUTE'),'new function inherits no public browser grant');
select throws_ok($q$set local role authenticated; select * from private.time_tracker_operation_receipts$q$,'42501',null,'actual browser role cannot read receipts');
select throws_ok($q$set local role service_role; insert into private.time_tracker_operation_scopes(ws_id,actor_id) values(gen_random_uuid(),gen_random_uuid())$q$,'42501',null,'actual service role cannot bypass function with DML');
select ok(has_function_privilege('authenticated','public.pause_session_for_break(uuid,timestamptz,integer,boolean)','EXECUTE'),'legacy public pause reachability is explicit; closure OPEN');
select ok(has_function_privilege('authenticated','public.update_time_tracking_session_with_bypass(uuid,jsonb)','EXECUTE'),'legacy public update bypass reachability is explicit; closure OPEN');
select ok((select bool_and(not has_table_privilege(browser_role,'public.time_tracking_sessions',privilege))
 from unnest(array['anon','authenticated']) browser_role
 cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege),
 'description-table hardening denies every browser session table privilege; definer closure remains OPEN');
select ok((select bool_and(has_table_privilege('authenticated','public.time_tracking_breaks',privilege)) from unnest(array['INSERT','UPDATE','DELETE']) privilege),'every legacy browser break DML grant remains explicit; closure OPEN');
select is((select count(*) from pg_constraint where conrelid='public.time_tracking_sessions'::regclass and contype='u' and pg_get_constraintdef(oid) like '%is_running%'),0::bigint,'running uniqueness is a partial index rather than a fabricated constraint');
select ok(exists(select 1 from pg_index i where i.indrelid='public.time_tracking_sessions'::regclass and i.indisunique and pg_get_indexdef(i.indexrelid) like '%ws_id, user_id%' and pg_get_expr(i.indpred,i.indrelid) like '%is_running%'),'actual actor/workspace partial running uniqueness exists');
select is((select count(*) from pg_proc where oid in(
 'public.stop_other_running_sessions()'::regprocedure,
 'public.update_productivity_score()'::regprocedure)
 and not prosecdef and proconfig = array['search_path=""']),2::bigint,'reachable session triggers retain invoker security and empty fixed paths');
select ok((select prosrc like '%update public.time_tracking_sessions%' from pg_proc where oid='public.stop_other_running_sessions()'::regprocedure),'running-session trigger binds the canonical public table');
select ok((select prosrc like '%public.calculate_productivity_score(%' and prosrc like '%from public.time_tracking_categories%' from pg_proc where oid='public.update_productivity_score()'::regprocedure),'productivity trigger binds the canonical public calculator and categories');
select * from finish();
rollback;
