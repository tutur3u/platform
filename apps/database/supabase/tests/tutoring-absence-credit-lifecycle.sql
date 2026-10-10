begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into auth.users(id) values(pg_temp.fid(92701)),(pg_temp.fid(92702)),(pg_temp.fid(92703));
insert into public.users(id) values(pg_temp.fid(92701)),(pg_temp.fid(92702)),(pg_temp.fid(92703)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
  (pg_temp.fid(92711),'Synthetic absence scope',false,pg_temp.fid(92701)),
  (pg_temp.fid(92712),'Synthetic foreign scope',false,pg_temp.fid(92702));
insert into public.workspace_members(ws_id,user_id,type) values
  (pg_temp.fid(92711),pg_temp.fid(92701),'MEMBER'),
  (pg_temp.fid(92711),pg_temp.fid(92702),'GUEST') on conflict do nothing;
insert into public.workspace_users(id,ws_id,full_name) values
  (pg_temp.fid(92721),pg_temp.fid(92711),'Synthetic learner'),
  (pg_temp.fid(92722),pg_temp.fid(92711),'Synthetic teacher'),
  (pg_temp.fid(92723),pg_temp.fid(92712),'Synthetic foreign learner');
insert into public.workspace_user_groups(id,ws_id,name) values
  (pg_temp.fid(92731),pg_temp.fid(92711),'Synthetic class'),
  (pg_temp.fid(92732),pg_temp.fid(92712),'Synthetic foreign class');
insert into public.workspace_user_groups_users(group_id,user_id,role) values
  (pg_temp.fid(92731),pg_temp.fid(92721),'STUDENT'),
  (pg_temp.fid(92731),pg_temp.fid(92722),'TEACHER'),
  (pg_temp.fid(92732),pg_temp.fid(92723),'STUDENT');
insert into private.workspace_user_group_sessions(id,ws_id,group_id,starts_at,ends_at,start_timezone,end_timezone) values
  (pg_temp.fid(92741),pg_temp.fid(92711),pg_temp.fid(92731),'2030-01-01 08:00Z','2030-01-01 09:00Z','UTC','UTC'),
  (pg_temp.fid(92742),pg_temp.fid(92711),pg_temp.fid(92731),'2030-01-01 10:00Z','2030-01-01 11:00Z','UTC','UTC');
insert into public.user_group_attendance(id,group_id,user_id,date,status,session_id) values
  (pg_temp.fid(92751),pg_temp.fid(92731),pg_temp.fid(92721),'2030-01-01','ABSENT',pg_temp.fid(92741)),
  (pg_temp.fid(92752),pg_temp.fid(92731),pg_temp.fid(92721),'2030-01-01','ABSENT',pg_temp.fid(92742)),
  (pg_temp.fid(92753),pg_temp.fid(92731),pg_temp.fid(92721),'2030-01-02','PRESENT',null),
  (pg_temp.fid(92754),pg_temp.fid(92732),pg_temp.fid(92723),'2030-01-01','ABSENT',null),
  (pg_temp.fid(92755),pg_temp.fid(92731),pg_temp.fid(92721),'2030-01-03','ABSENT',null);
create function pg_temp.input(n integer) returns jsonb language sql as $$
  select jsonb_build_object('action','CREATE','groupId',pg_temp.fid(92731),'studentUserId',pg_temp.fid(92721),
    'slots',jsonb_build_array(jsonb_build_object('sourceAttendanceId',pg_temp.fid(n),'teacherUserId',pg_temp.fid(92722),
      'sessionDate','2030-01-04','startTime','14:00','durationMinutes',45)));
$$;
create function pg_temp.create_credit(n integer,command integer) returns jsonb language sql as $$
  select private.manage_tutoring_absence_credit(pg_temp.fid(92711),pg_temp.fid(92701),pg_temp.fid(command),pg_temp.input(n));
$$;
create function pg_temp.change_credit(n integer,command integer,revision text,status text,reason text default 'ABSENT_RECOVERY') returns jsonb language sql as $$
  select private.manage_tutoring_absence_credit(pg_temp.fid(92711),pg_temp.fid(92701),pg_temp.fid(command),
    jsonb_build_object('action','TRANSITION','creditId',(select id from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(n) order by (state='RELEASED') desc,id limit 1),
      'expectedRevision',revision,'attendanceStatus',status,'reasonType',reason));
$$;

select pg_temp.create_credit(92751,92761);
select is(pg_temp.change_credit(92751,92762,'1','CANCELLED')->>'state','RELEASED','cancel releases once');
select is((select absence_date from private.tutoring_absence_credits),'2030-01-01'::date,'cancel retains original source date');
select throws_ok($q$select pg_temp.change_credit(92751,92763,'1','PENDING')$q$,'40001','Tutoring credit revision conflict','stale cancel/restart CAS rejected');
select pg_temp.create_credit(92751,92764);
select throws_ok($q$select pg_temp.change_credit(92751,92765,'2','PENDING')$q$,'40001','Source absence already credited','old cancelled claim cannot steal new reservation');
select is((select count(*) from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92751) and state='RESERVED'),1::bigint,'one active reservation survives stale resume');
select pg_temp.create_credit(92752,92766);
select is(pg_temp.change_credit(92752,92767,'1','DONE')->>'state','CREDITED','DONE permanently credits source');
select throws_ok($q$select pg_temp.change_credit(92752,92768,'2','CANCELLED')$q$,'55000','Credited tutoring history retained','DONE cannot release through cancellation');
select throws_ok($q$select pg_temp.change_credit(92752,92768,'2','DONE','CUSTOM')$q$,'55000','Credited tutoring history retained','DONE cannot release by reason transition');
select throws_ok($q$select private.manage_tutoring_absence_credit(pg_temp.fid(92711),pg_temp.fid(92701),pg_temp.fid(92768),jsonb_build_object('action','DELETE','creditId',(select id from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92752)),'expectedRevision','2'))$q$,'55000','Credited tutoring history retained','DONE deletion denied');
select lives_ok($q$select private.manage_tutoring_absence_credit(pg_temp.fid(92711),pg_temp.fid(92701),pg_temp.fid(92769),jsonb_build_object('action','RESOLVE','creditId',(select id from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92752)),'expectedRevision','2'))$q$,'explicit correction resolves credited source without releasing history');
select is((select status from public.user_group_attendance where id=pg_temp.fid(92752)),'PRESENT','explicit correction changes attendance');
select is((select state from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92752)),'CREDITED','credited source remains permanently consumed');
select is((select count(*) from private.tutoring_absence_write_permits),0::bigint,'resolution leaves no reusable permit');
-- A caught exception AFTER actual canonical mutation must roll back every effect.
create temp table before_failure as select jsonb_build_object(
 'sessions',(select jsonb_agg(to_jsonb(s) order by id) from private.workspace_tutoring_sessions s where ws_id=pg_temp.fid(92711)),
 'credits',(select jsonb_agg(to_jsonb(c) order by id) from private.tutoring_absence_credits c where ws_id=pg_temp.fid(92711)),
 'commands',(select jsonb_agg(to_jsonb(c) order by command_id) from private.tutoring_absence_commands c where ws_id=pg_temp.fid(92711))) snapshot;
create function pg_temp.fail_after_operation() returns void language plpgsql as $$ begin
  perform pg_temp.change_credit(92751,92770,'2','NO_SHOW');
  raise exception 'Synthetic downstream failure' using errcode='P0001';
end; $$;
select throws_ok($q$select pg_temp.fail_after_operation()$q$,'P0001','Synthetic downstream failure','external caught failure remains failure');
select is(jsonb_build_object(
 'sessions',(select jsonb_agg(to_jsonb(s) order by id) from private.workspace_tutoring_sessions s where ws_id=pg_temp.fid(92711)),
 'credits',(select jsonb_agg(to_jsonb(c) order by id) from private.tutoring_absence_credits c where ws_id=pg_temp.fid(92711)),
 'commands',(select jsonb_agg(to_jsonb(c) order by command_id) from private.tutoring_absence_commands c where ws_id=pg_temp.fid(92711))),
 (select snapshot from before_failure),'caught failure rolls back complete state/history/receipt');
select is((select count(*) from private.tutoring_absence_write_permits),0::bigint,'caught rollback leaks no permit');
create function pg_temp.fail_during_permit() returns trigger language plpgsql as $$ begin
  if new.attendance_status='NO_SHOW' then raise exception 'Synthetic permit-window failure' using errcode='P0001'; end if;
  return new;
end; $$;
create trigger synthetic_absence_failure after update on private.workspace_tutoring_sessions
  for each row execute function pg_temp.fail_during_permit();
select throws_ok($q$select pg_temp.change_credit(92751,92770,'2','NO_SHOW')$q$,'P0001','Synthetic permit-window failure','failure inside admitted mutation rolls back');
select is((select count(*) from private.tutoring_absence_write_permits),0::bigint,'permit-window exception leaves no authority');
select is(jsonb_build_object(
 'sessions',(select jsonb_agg(to_jsonb(s) order by id) from private.workspace_tutoring_sessions s where ws_id=pg_temp.fid(92711)),
 'credits',(select jsonb_agg(to_jsonb(c) order by id) from private.tutoring_absence_credits c where ws_id=pg_temp.fid(92711)),
 'commands',(select jsonb_agg(to_jsonb(c) order by command_id) from private.tutoring_absence_commands c where ws_id=pg_temp.fid(92711))),
 (select snapshot from before_failure),'inside mutation failure restores sessions/credits/history/receipts');
drop trigger synthetic_absence_failure on private.workspace_tutoring_sessions;

-- Delete the original released session; immutable source receipt survives.
select lives_ok($q$select private.manage_tutoring_absence_credit(pg_temp.fid(92711),pg_temp.fid(92701),pg_temp.fid(92771),jsonb_build_object('action','DELETE','creditId',(select id from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92751) and state='RELEASED'),'expectedRevision','2'))$q$,'cancelled pending session deletion allowed');
select ok(exists(select 1 from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92751) and state='RELEASED' and session_id is null),'deleted session leaves immutable credit history');
select pg_temp.create_credit(92755,92772);
select is(pg_temp.change_credit(92755,92773,'1','PENDING','WEAK_SUPPORT')->>'state','RELEASED','reason change releases reservation explicitly');
select is((select original_attendance_id from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92755)),pg_temp.fid(92755),'reason edit retains attribution');
-- Mutable enrollment is admission for NEW claims, not replay or release.
update public.workspace_users set archived=true where id=pg_temp.fid(92721);
select is(pg_temp.create_credit(92751,92764)->>'createdCount','1','input-bound replay survives learner archive');
select throws_ok($q$select pg_temp.create_credit(92755,92764)$q$,'40001','Tutoring credit command conflict','changed archived replay remains conflict');
select throws_ok($q$select pg_temp.create_credit(92755,92775)$q$,'22023','Tutoring credit scope unavailable','archive still denies new claim');
select is(private.manage_tutoring_absence_credit(pg_temp.fid(92711),pg_temp.fid(92701),pg_temp.fid(92776),
 jsonb_build_object('action','TRANSITION','creditId',(select id from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92751) and state='RESERVED'),
 'expectedRevision','1','attendanceStatus','CANCELLED','reasonType','ABSENT_RECOVERY'))->>'state','RELEASED','authorized archive release remains possible');
update public.workspace_users set archived=false where id=pg_temp.fid(92721);
-- Existing attendance/member FKs still restrict unsupported scoped parent rekeys.
select throws_ok($q$update public.workspace_user_groups set id=pg_temp.fid(92733) where id=pg_temp.fid(92731)$q$,'23503',null,'group rekey retains existing attendance FK restriction');
select throws_ok($q$update public.workspace_users set id=pg_temp.fid(92725) where id=pg_temp.fid(92721)$q$,'23503',null,'learner rekey retains existing attendance FK restriction');
select throws_ok($q$update public.workspaces set id=pg_temp.fid(92713) where id=pg_temp.fid(92711)$q$,'23503',null,'workspace rekey retains existing workspace-user FK restriction');
-- Actual FK rekeys preserve immutable occurrence snapshots and live references.
select lives_ok($q$update private.workspace_user_group_sessions set id=pg_temp.fid(92743) where id=pg_temp.fid(92742)$q$,'actual occurrence rekey cascades through guarded attendance');
select ok(exists(select 1 from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92752)
 and original_class_session_id=pg_temp.fid(92742) and class_session_id=pg_temp.fid(92743)),'occurrence rekey preserves original snapshot and live FK');
select throws_ok($q$update public.user_group_attendance set session_id=pg_temp.fid(92741) where id=pg_temp.fid(92752)$q$,
 '40001','Source absence requires explicit credit resolution','existing-parent direct occurrence rewrite is not a cascade');
select lives_ok($q$delete from private.workspace_user_group_sessions where id=pg_temp.fid(92743)$q$,'actual occurrence deletion retains DONE history');
select ok(exists(select 1 from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92752)
 and state='CREDITED' and attendance_id is null and class_session_id is null and original_class_session_id=pg_temp.fid(92742)),
 'deleted occurrence retains credited identity and snapshot');
-- A fresh reservation is released by deletion of its actual occurrence parent.
select pg_temp.create_credit(92751,92777);
create temp table pending_occurrence_snapshot as select id,revision,history,original_class_session_id
 from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92751) and state='RESERVED';
select lives_ok($q$delete from private.workspace_user_group_sessions where id=pg_temp.fid(92741)$q$,'occurrence deletion releases pending source');
select ok(not exists(select 1 from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92751) and state='RESERVED'),
 'no stranded reservation after occurrence cascade');
select ok(exists(select 1 from private.tutoring_absence_credits c join pending_occurrence_snapshot b using(id)
 where c.state='RELEASED' and c.revision=b.revision+1 and c.class_session_id is null and c.attendance_id is null
 and c.original_class_session_id=b.original_class_session_id
 and c.history=b.history||jsonb_build_array(jsonb_build_object('operation','PARENT_REMOVED'))),
 'occurrence cascade releases once, clears live pointers and preserves original snapshot');
select is(pg_temp.create_credit(92751,92777)->>'createdCount','1','replay survives actual source deletion without second write');
-- A real teacher parent rekey/delete is permitted; a caller rewrite is not.
select throws_ok($q$update public.workspace_users set id=pg_temp.fid(92724) where id=pg_temp.fid(92722)$q$,'23503',null,'existing teacher enrollment FK still restricts parent rekey');
delete from public.workspace_user_groups_users where user_id=pg_temp.fid(92722) and group_id=pg_temp.fid(92731);
select lives_ok($q$update public.workspace_users set id=pg_temp.fid(92724) where id=pg_temp.fid(92722)$q$,'teacher FK rekey preserves linked sessions');
select ok(not exists(select 1 from private.workspace_tutoring_sessions where ws_id=pg_temp.fid(92711) and teacher_user_id=pg_temp.fid(92722)),
 'teacher cascade updates all historical linked sessions');
select throws_ok($q$update private.workspace_tutoring_sessions set teacher_user_id=null where ws_id=pg_temp.fid(92711) and teacher_user_id=pg_temp.fid(92724)$q$,
 '40001','Linked tutoring credit requires canonical operation','existing teacher cannot be erased by forged direct rewrite');
select lives_ok($q$delete from public.workspace_users where id=pg_temp.fid(92724)$q$,'teacher deletion uses exact SET NULL action');
select ok(not exists(select 1 from private.workspace_tutoring_sessions where ws_id=pg_temp.fid(92711) and teacher_user_id is not null),
 'teacher deletion leaves no dangling live pointer');
-- Existing legacy rows remain outside linkage lifecycle rules.
insert into private.workspace_tutoring_sessions(id,ws_id,group_id,student_user_id,session_date,start_time,reason_type)
 values(pg_temp.fid(92781),pg_temp.fid(92711),pg_temp.fid(92731),pg_temp.fid(92721),'2030-01-04','14:00','ABSENT_RECOVERY');
select lives_ok($q$update private.workspace_tutoring_sessions set attendance_status='CANCELLED' where id=pg_temp.fid(92781)$q$,'unlinked historical writer behavior unchanged');
-- Current schema deliberately preserves attendance after membership departure.
create temp table attendance_before_departure as select jsonb_agg(to_jsonb(a) order by id) snapshot
 from public.user_group_attendance a where group_id=pg_temp.fid(92731) and user_id=pg_temp.fid(92721);
select lives_ok($q$delete from public.workspace_user_groups_users where group_id=pg_temp.fid(92731) and user_id=pg_temp.fid(92721)$q$,'existing membership departure remains valid');
select is((select jsonb_agg(to_jsonb(a) order by id) from public.user_group_attendance a
 where group_id=pg_temp.fid(92731) and user_id=pg_temp.fid(92721)),
 (select snapshot from attendance_before_departure),'membership departure preserves exact attendance history');
select ok(exists(select 1 from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92752) and state='CREDITED' and attendance_id is null),'teardown retains DONE original source snapshot');
select is(pg_temp.create_credit(92755,92772)->>'createdCount','1','original replay survives membership departure');
select is(pg_temp.change_credit(92755,92778,'2','CANCELLED')->>'state','RELEASED','tenant-authorized release survives missing enrollment/source');
select throws_ok($q$select pg_temp.change_credit(92755,92779,'3','PENDING')$q$,'22023','Tutoring credit scope unavailable','new reservation still requires enrollment');
-- Revoke a noncreator through authorized maintenance; creator protection remains intact.
update public.workspaces set creator_id=pg_temp.fid(92703) where id=pg_temp.fid(92711);
create function pg_temp.set_actor_membership(member_type public.workspace_member_type) returns void
language plpgsql as $$
declare saved_role text:=current_setting('request.jwt.claim.role',true);
  saved_claims text:=current_setting('request.jwt.claims',true);
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.workspace_members set type=member_type
    where ws_id=pg_temp.fid(92711) and user_id=pg_temp.fid(92701);
  perform set_config('request.jwt.claim.role',coalesce(saved_role,''),true);
  perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);
end; $$;
select pg_temp.set_actor_membership('GUEST');
select is((select type::text from public.workspace_members where ws_id=pg_temp.fid(92711) and user_id=pg_temp.fid(92703)),
 'MEMBER','separate workspace creator remains MEMBER during actor revocation');
select throws_ok($q$select pg_temp.create_credit(92755,92772)$q$,'42501','Tutoring credit forbidden','revoked actor cannot replay retained receipt');
select pg_temp.set_actor_membership('MEMBER');
-- Creation attribution follows actual parent rekey/SET NULL, never direct writes.
select throws_ok($q$update public.users set id=pg_temp.fid(92704) where id=pg_temp.fid(92701)$q$,'23503',null,'existing actor membership FK still restricts parent rekey');
delete from public.workspace_members where user_id=pg_temp.fid(92701);
select throws_ok($q$update public.users set id=pg_temp.fid(92704) where id=pg_temp.fid(92701)$q$,
 '23503',null,'existing private-details FK also restricts unsupported user rekey');
-- Isolate the intended created_by RI action, without changing shared FK policy.
delete from public.user_private_details where user_id=pg_temp.fid(92701);
select lives_ok($q$update public.users set id=pg_temp.fid(92704) where id=pg_temp.fid(92701)$q$,'creator rekey preserves historical linked sessions');
select ok(not exists(select 1 from private.workspace_tutoring_sessions where ws_id=pg_temp.fid(92711) and created_by=pg_temp.fid(92701)),
 'creator rekey cascades live attribution without rewriting credit history');
update public.workspaces set creator_id=pg_temp.fid(92702) where creator_id=pg_temp.fid(92704);
select lives_ok($q$delete from public.users where id=pg_temp.fid(92704)$q$,'creator deletion uses declared SET NULL');
select ok(not exists(select 1 from private.workspace_tutoring_sessions where ws_id=pg_temp.fid(92711) and created_by is not null),
 'creator deletion retains sessions and clears only live attribution');
select lives_ok($q$delete from public.workspace_user_groups where id=pg_temp.fid(92731)$q$,'group cascade can delete linked sessions and scoped ledger');
select ok(not exists(select 1 from private.tutoring_absence_credits where group_id=pg_temp.fid(92731))
 and not exists(select 1 from private.workspace_tutoring_sessions where group_id=pg_temp.fid(92731)),
 'group deletion leaves no scoped credits or linked sessions');
select lives_ok($q$delete from public.workspaces where id=pg_temp.fid(92711)$q$,'workspace teardown preserves existing cleanup');
select * from finish();
rollback;
