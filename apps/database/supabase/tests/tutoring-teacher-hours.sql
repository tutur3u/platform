begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql as $$
 select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into auth.users(id) values(pg_temp.fid(96001)),(pg_temp.fid(96002)),(pg_temp.fid(96003)),(pg_temp.fid(96004));
insert into public.users(id) values(pg_temp.fid(96001)),(pg_temp.fid(96002)),(pg_temp.fid(96003)),(pg_temp.fid(96004)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
 (pg_temp.fid(96011),'Synthetic hours scope',false,pg_temp.fid(96001)),
 (pg_temp.fid(96012),'Synthetic foreign hours',false,pg_temp.fid(96002));
insert into public.workspace_members(ws_id,user_id,type) values
 (pg_temp.fid(96011),pg_temp.fid(96001),'MEMBER'),
 (pg_temp.fid(96012),pg_temp.fid(96002),'MEMBER'),
 (pg_temp.fid(96011),pg_temp.fid(96002),'MEMBER'),
 (pg_temp.fid(96011),pg_temp.fid(96003),'GUEST') on conflict do nothing;
-- Membership alone must not imply either hours permission.
delete from public.workspace_role_members m using public.workspace_roles r
 where m.role_id=r.id and r.ws_id=pg_temp.fid(96011) and m.user_id=pg_temp.fid(96002);
update public.workspace_default_permissions set enabled=false where ws_id=pg_temp.fid(96011);
insert into public.workspace_users(id,ws_id,full_name) values
 (pg_temp.fid(96021),pg_temp.fid(96011),'Synthetic teacher'),
 (pg_temp.fid(96022),pg_temp.fid(96012),'Synthetic foreign teacher'),
 (pg_temp.fid(96023),pg_temp.fid(96011),'Synthetic learner');
insert into public.workspace_user_groups(id,ws_id,name) values
 (pg_temp.fid(96031),pg_temp.fid(96011),'Synthetic teacher group'),
 (pg_temp.fid(96032),pg_temp.fid(96012),'Synthetic foreign group');
insert into public.workspace_user_groups_users(user_id,group_id,role) values
 (pg_temp.fid(96021),pg_temp.fid(96031),'TEACHER'),
 (pg_temp.fid(96022),pg_temp.fid(96032),'TEACHER'),
 (pg_temp.fid(96023),pg_temp.fid(96031),'STUDENT');
create function pg_temp.base(rev text,week jsonb default '{"1":[{"start":"09:00","end":"17:00"}],"2":[]}')
returns jsonb language sql as $$ select private.save_tutoring_hours_default(pg_temp.fid(96011),pg_temp.fid(96001),rev,'Asia/Ho_Chi_Minh',true,week); $$;
create function pg_temp.custom(base text,rev text,week jsonb,reset boolean default false)
returns jsonb language sql as $$ select private.save_tutoring_hours_override(pg_temp.fid(96011),pg_temp.fid(96001),pg_temp.fid(96021),base,rev,week,reset); $$;
-- Actual CHECK validator and timezone catalog, not regex-only source proof.
select ok(private.valid_tutoring_hours_week('{}'),'empty week UNKNOWN/inherit valid');
select ok(private.valid_tutoring_hours_week('{"1":[]}'),'explicit closed day valid');
select ok(private.valid_tutoring_hours_week('{"7":[{"start":"22:00","end":"24:00"}],"1":[{"start":"00:00","end":"02:00"}]}'),'explicit overnight/week wrap valid');
select ok(private.valid_tutoring_hours_week('{"1":[{"start":"09:00","end":"10:00"},{"start":"10:00","end":"11:00"}]}'),'half-open adjacent windows valid');
select ok(not private.valid_tutoring_hours_week(v),'invalid window '||label)
from (values
 ('null'::jsonb,'null'),('[]','array'),('{"0":[]}','weekday0'),('{"8":[]}','weekday8'),
 ('{"1":null}','null day'),('{"1":[null]}','null block'),
 ('{"1":[{"start":"9:00","end":"10:00"}]}','noncanonical clock'),
 ('{"1":[{"start":"24:00","end":"24:00"}]}','midnight start'),
 ('{"1":[{"start":"10:00","end":"10:00"}]}','zero'),
 ('{"1":[{"start":"10:00","end":"09:00"}]}','unsplit overnight'),
 ('{"1":[{"start":"09:00","end":"11:00"},{"start":"10:00","end":"12:00"}]}','overlap'),
 ('{"1":[{"start":"12:00","end":"13:00"},{"start":"09:00","end":"10:00"}]}','unsorted'),
 ('{"1":[{"start":"09:00","end":"10:00","extra":"untyped"}]}','extra property')
) t(v,label);
select ok(not private.valid_tutoring_hours_week(jsonb_build_object('1',(select jsonb_agg(jsonb_build_object('start',to_char(time '00:00'+n*interval '1 minute','HH24:MI'),'end',to_char(time '00:00'+(n+1)*interval '1 minute','HH24:MI'))) from generate_series(0,24) n))), '25 otherwise-disjoint windows denied');
select ok(private.valid_tutoring_hours_timezone(zone),'DB IANA timezone accepted: '||zone)
from (values('Asia/Ho_Chi_Minh'),('America/New_York'),('UTC'),('Etc/GMT+7')) t(zone);
select ok(not private.valid_tutoring_hours_timezone(zone),'DB timezone rejected: '||coalesce(zone,'null'))
from (values('auto'),(''),('+07:00'),('Not/AZone'),(null)) t(zone);
select ok(not private.valid_tutoring_hours_revision(rev),'invalid revision rejected: '||rev)
from (values('0'),('-1'),('01'),('1.0'),('x'),('9223372036854775808')) t(rev);
select ok(private.valid_tutoring_hours_revision('9007199254740993123'),'revision above JS safe precision accepted');
select is(private.read_tutoring_teacher_hours(pg_temp.fid(96011),pg_temp.fid(96001)),
 '{"default":null,"override":null}'::jsonb,'unconfigured read remains UNKNOWN');
select is((select count(*) from private.workspace_tutoring_hours_anchors),0::bigint,'GET does not provision anchor');
select throws_ok($q$select pg_temp.custom(null,null,'{}')$q$,'P0002','Tutoring hours frame unavailable','override cannot supply missing staff frame');
select is((select count(*) from private.workspace_tutoring_hours_anchors),0::bigint,'failed write rolls back anchor');
select is(pg_temp.base(null)->>'revision','1','first save receipt is decimal TEXT');
select is(jsonb_typeof(pg_temp.base('1')->'revision'),'string','same-content revision receipt remains string');
select is((private.read_tutoring_teacher_hours(pg_temp.fid(96011),pg_temp.fid(96001))->'default'->>'revision'),'2','same-content save advances revision');
select throws_ok($q$select pg_temp.base(null)$q$,'40001','Tutoring hours revision conflict','second absent create cannot overwrite');
select throws_ok($q$select pg_temp.base('1')$q$,'40001','Tutoring hours revision conflict','old save revision rejected');
select throws_ok($q$select pg_temp.base('x')$q$,'22023','Invalid tutoring hours','invalid revision does not leak cast failure');
select throws_ok($q$select private.save_tutoring_hours_default(pg_temp.fid(96011),pg_temp.fid(96001),'2','auto',true,'{}')$q$,'22023','Invalid tutoring hours','auto timezone denied');
select throws_ok($q$select private.save_tutoring_hours_default(pg_temp.fid(96011),pg_temp.fid(96001),'2','UTC',false,'{}')$q$,'22023','Invalid tutoring hours','unconfirmed timezone denied');
select is(pg_temp.custom('2',null,'{"1":[{"start":"18:00","end":"20:00"}]}')->>'revision','1','override saved with independent revision');
select is(private.read_tutoring_teacher_hours(pg_temp.fid(96011),pg_temp.fid(96001),pg_temp.fid(96021))->'override'->'week',
 '{"1":[{"start":"18:00","end":"20:00"}]}'::jsonb,'override does not union default hours');
select is(private.read_tutoring_teacher_hours(pg_temp.fid(96011),pg_temp.fid(96001),pg_temp.fid(96021))->'default'->'week'->'2',
 '[]'::jsonb,'closed default retained separately for inheritance');
select is(pg_temp.custom('2','1','{"1":[]}')->>'revision','2','explicit override closed day saved');
select is(pg_temp.custom('2','2','{}',true)->>'revision','3','reset advances revision and retains empty tombstone');
select is((select week from private.workspace_tutoring_hours_overrides where teacher_id=pg_temp.fid(96021)),'{}'::jsonb,'reset row remains');
select throws_ok($q$select pg_temp.custom('2',null,'{"1":[]}')$q$,'40001','Tutoring hours revision conflict','absent-create cannot revive reset ABA');
select throws_ok($q$select pg_temp.custom('2','2','{"1":[]}')$q$,'40001','Tutoring hours revision conflict','old revision cannot revive reset ABA');
select is(pg_temp.base('2','{"1":[]}')->>'revision','3','default changes independently');
select throws_ok($q$select pg_temp.custom('2','3','{}',true)$q$,'40001','Tutoring hours revision conflict','default revision change fences override edit');
select throws_ok($q$select pg_temp.custom('3','3','{"1":[]}',true)$q$,'22023','Invalid tutoring hours','reset must be empty, no disguised new override');
select is(pg_temp.custom('3','3','{}',true)->>'revision','4','repeated reset advances revision');
select throws_ok($q$select private.save_tutoring_hours_override(pg_temp.fid(96011),pg_temp.fid(96001),pg_temp.fid(96022),'3',null,'{}')$q$,'P0002','Tutoring teacher unavailable','foreign teacher rejected');
select throws_ok($q$select private.save_tutoring_hours_override(pg_temp.fid(96011),pg_temp.fid(96001),pg_temp.fid(96023),'3',null,'{}')$q$,'P0002','Tutoring teacher unavailable','nonteacher rejected');
update public.workspace_user_groups_users set role='STUDENT' where user_id=pg_temp.fid(96021);
select throws_ok($q$select pg_temp.custom('3','4','{}')$q$,'P0002','Tutoring teacher unavailable','current role removal denies edit');
update public.workspace_user_groups_users set role='TEACHER' where user_id=pg_temp.fid(96021);
select lives_ok($q$select pg_temp.custom('3','4','{}')$q$,'current role restored allowed; no historical ABA claim');
select throws_ok($q$select private.read_tutoring_teacher_hours(pg_temp.fid(96011),pg_temp.fid(96002))$q$,'42501','Tutoring hours forbidden','member without read permission denied');
select throws_ok($q$select private.save_tutoring_hours_default(pg_temp.fid(96011),pg_temp.fid(96002),'3','UTC',true,'{}')$q$,'42501','Tutoring hours forbidden','member without write permission denied');
select throws_ok($q$select private.read_tutoring_teacher_hours(pg_temp.fid(96011),pg_temp.fid(96003))$q$,'42501','Tutoring hours forbidden','GUEST cannot read');
select throws_ok($q$select private.save_tutoring_hours_default(pg_temp.fid(96011),pg_temp.fid(96004),'3','UTC',true,'{}')$q$,'42501','Tutoring hours forbidden','nonmember cannot write');
select throws_ok($q$select private.read_tutoring_teacher_hours(pg_temp.fid(96011),pg_temp.fid(96021))$q$,'42501','Tutoring hours forbidden','workspace teacher ID is not account actor');
select is((select created_by from private.workspace_tutoring_hours_defaults where ws_id=pg_temp.fid(96011)),pg_temp.fid(96001),'actor stamped');
select is((select record->>'revision' from audit.record_version where table_name='workspace_tutoring_hours_overrides' and record->>'teacher_id'=pg_temp.fid(96021)::text order by id desc limit 1),'5','atomic audit carries current revision');
select ok(not exists(select 1 from audit.record_version where table_name like 'workspace_tutoring_hours_%'
 and (record ? 'week' or record ? 'time_zone' or record ? 'full_name')),'audit excludes private hours content');
select ok(exists(select 1 from audit.record_version where table_name='workspace_tutoring_hours_overrides' and record->>'action'='teacher_hours.reset' and auth_uid=pg_temp.fid(96001)),'reset action has real account actor');
select ok(not exists(select 1 from audit.record_version v where v.table_name in ('workspace_tutoring_hours_defaults','workspace_tutoring_hours_overrides')
 and (v.record_id is distinct from audit.to_record_id(v.table_oid,case when v.table_name='workspace_tutoring_hours_defaults' then array['ws_id'] else array['ws_id','teacher_id'] end,v.record)
 or (v.old_record is not null and v.old_record_id is distinct from audit.to_record_id(v.table_oid,case when v.table_name='workspace_tutoring_hours_defaults' then array['ws_id'] else array['ws_id','teacher_id'] end,v.old_record)))), 'audit canonical IDs include PK and table identity');
select isnt(audit.to_record_id('private.workspace_tutoring_hours_overrides'::regclass::oid,array['ws_id','teacher_id'],jsonb_build_object('ws_id',pg_temp.fid(96011),'teacher_id',pg_temp.fid(96021))),
 audit.to_record_id('private.workspace_tutoring_hours_overrides'::regclass::oid,array['ws_id','teacher_id'],jsonb_build_object('ws_id',pg_temp.fid(96012),'teacher_id',pg_temp.fid(96021))), 'audit identity distinguishes workspace');
-- Actual audit insertion failure must roll back revision and payload.
create function pg_temp.reject_hours_audit() returns trigger language plpgsql as $$
begin if new.table_name like 'workspace_tutoring_hours_%' then raise exception 'Synthetic audit rejection'; end if; return new; end; $$;
create trigger synthetic_hours_audit_reject before insert on audit.record_version for each row execute function pg_temp.reject_hours_audit();
select throws_ok($q$select pg_temp.base('3','{}')$q$,'P0001','Synthetic audit rejection','audit failure rolls back confirmed transaction');
select is((select revision::text from private.workspace_tutoring_hours_defaults where ws_id=pg_temp.fid(96011)),'3','audit rejection did not advance default');
drop trigger synthetic_hours_audit_reject on audit.record_version;
-- Full precision and overflow are exercised through the actual save RPC.
update private.workspace_tutoring_hours_defaults set revision=9007199254740993123 where ws_id=pg_temp.fid(96011);
select is(pg_temp.base('9007199254740993123')->>'revision','9007199254740993124','above-safe-integer exact decimal save receipt');
update private.workspace_tutoring_hours_defaults set revision=9223372036854775807 where ws_id=pg_temp.fid(96011);
select throws_ok($q$select pg_temp.base('9223372036854775807')$q$,'22003','bigint out of range','revision overflow never wraps');
select is((select revision::text from private.workspace_tutoring_hours_defaults where ws_id=pg_temp.fid(96011)),'9223372036854775807','overflow leaves current revision intact');
-- Catalog privilege inventory checks every role/privilege separately (comma lists mean ANY).
select ok(not has_table_privilege(role,tbl,privilege),role||' denied '||privilege||' on '||tbl)
from (values('anon'),('authenticated'),('service_role')) r(role)
cross join (values('private.workspace_tutoring_hours_anchors'),('private.workspace_tutoring_hours_defaults'),('private.workspace_tutoring_hours_overrides')) t(tbl)
cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege);
select ok(not exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0),'PUBLIC table ACL denied: '||c.relname)
from pg_class c where c.oid in('private.workspace_tutoring_hours_anchors'::regclass,'private.workspace_tutoring_hours_defaults'::regclass,'private.workspace_tutoring_hours_overrides'::regclass);
select ok(c.relrowsecurity and not exists(select 1 from pg_policy where polrelid=c.oid),'hours table RLS with no direct caller policy: '||c.relname)
from pg_class c where c.oid in('private.workspace_tutoring_hours_anchors'::regclass,'private.workspace_tutoring_hours_defaults'::regclass,'private.workspace_tutoring_hours_overrides'::regclass);
select ok(not has_function_privilege(role,p.oid,'EXECUTE'),role||' denied helper/RPC '||p.proname)
from pg_proc p cross join (values('anon'),('authenticated')) r(role)
where p.pronamespace='private'::regnamespace and p.proname in
 ('valid_tutoring_hours_week','valid_tutoring_hours_timezone','valid_tutoring_hours_revision','assert_tutoring_hours_actor','lock_tutoring_hours_teacher','audit_tutoring_hours_revision','read_tutoring_teacher_hours','save_tutoring_hours_default','save_tutoring_hours_override');
select ok(not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC denied '||p.proname)
from pg_proc p where p.pronamespace='private'::regnamespace and p.proname like '%tutoring_hours%' or (p.pronamespace='private'::regnamespace and p.proname='read_tutoring_teacher_hours');
select ok(has_function_privilege('service_role',p.oid,'EXECUTE')=(p.proname in ('read_tutoring_teacher_hours','save_tutoring_hours_default','save_tutoring_hours_override')),'only scoped RPC service capability: '||p.proname)
from pg_proc p where p.pronamespace='private'::regnamespace and p.proname in
 ('valid_tutoring_hours_week','valid_tutoring_hours_timezone','valid_tutoring_hours_revision','assert_tutoring_hours_actor','lock_tutoring_hours_teacher','audit_tutoring_hours_revision','read_tutoring_teacher_hours','save_tutoring_hours_default','save_tutoring_hours_override');
select ok(exists(select 1 from unnest(p.proconfig) c where replace(c,'"','')='search_path='),'fixed empty search path: '||p.proname)
from pg_proc p where p.pronamespace='private'::regnamespace and p.proname in
 ('valid_tutoring_hours_week','valid_tutoring_hours_timezone','valid_tutoring_hours_revision','assert_tutoring_hours_actor','lock_tutoring_hours_teacher','audit_tutoring_hours_revision','read_tutoring_teacher_hours','save_tutoring_hours_default','save_tutoring_hours_override');
select * from finish();
rollback;
