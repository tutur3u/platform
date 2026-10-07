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

select ok(not exists(select 1 from unnest(array['original_attendance_id','ws_id','group_id','student_user_id','session_id','attendance_id','class_session_id']) field
 where not exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
 where i.indrelid='private.tutoring_absence_credits'::regclass and i.indisvalid and i.indpred is null and a.attname=field)),
 'full-history lookup and every credit FK have a valid leading unfiltered index');
select ok(not has_table_privilege('service_role','private.tutoring_absence_write_permits','SELECT,INSERT,UPDATE,DELETE'),'server cannot forge private permit');
select ok(not has_table_privilege('service_role','private.tutoring_absence_credits','SELECT,INSERT,UPDATE,DELETE'),'server cannot bypass canonical credit writer');
select ok(not has_function_privilege('authenticated','private.manage_tutoring_absence_credit(uuid,uuid,uuid,jsonb)','EXECUTE'),'browser cannot invoke canonical writer');
select ok(has_function_privilege('service_role','private.manage_tutoring_absence_credit(uuid,uuid,uuid,jsonb)','EXECUTE'),'verified backend may invoke writer');
select is(jsonb_array_length(private.read_tutoring_absence_credits(pg_temp.fid(92711),pg_temp.fid(92701))),0,'missing foundation has no historical backfill');
select throws_ok($q$select private.manage_tutoring_absence_credit(pg_temp.fid(92711),pg_temp.fid(92702),pg_temp.fid(92761),pg_temp.input(92751))$q$,'42501','Tutoring credit forbidden','GUEST cannot reserve');
select throws_ok($q$select private.manage_tutoring_absence_credit(pg_temp.fid(92711),pg_temp.fid(92703),pg_temp.fid(92761),pg_temp.input(92751))$q$,'42501','Tutoring credit forbidden','nonmember cannot reserve');
select throws_ok($q$select pg_temp.create_credit(92754,92761)$q$,'22023','Source absence unavailable','foreign source cannot reserve');
select throws_ok($q$select pg_temp.create_credit(92753,92761)$q$,'22023','Source absence unavailable','PRESENT source cannot reserve');
select throws_ok($q$select pg_temp.create_credit(92759,92761)$q$,'22023','Source absence unavailable','missing source cannot reserve');
select is((pg_temp.create_credit(92752,92761)->>'createdCount')::integer,1,'selected same-date second occurrence creates one');
select is((select original_attendance_id from private.tutoring_absence_credits),pg_temp.fid(92752),'identity is selected source, not oldest date');
select is((select original_class_session_id from private.tutoring_absence_credits),pg_temp.fid(92742),'class occurrence snapshot preserved');
select is((pg_temp.create_credit(92752,92761)->>'createdCount')::integer,1,'identical command returns original receipt');
select is((select count(*) from private.workspace_tutoring_sessions where ws_id=pg_temp.fid(92711)),1::bigint,'replay never generates second session');
select throws_ok($q$select pg_temp.create_credit(92751,92761)$q$,'40001','Tutoring credit command conflict','changed replay payload conflicts');
select throws_ok($q$select pg_temp.create_credit(92752,92762)$q$,'40001','Source absence already credited','same source cannot reserve twice');
select is((pg_temp.create_credit(92751,92763)->>'createdCount')::integer,1,'same-date first occurrence remains independently available');
select is((select count(*) from private.tutoring_absence_credits where state='RESERVED'),2::bigint,'distinct same-date identities each reserve once');
select is((select count(*) from private.tutoring_absence_write_permits),0::bigint,'successful return leaves no permit');
select throws_ok($q$select private.manage_tutoring_absence_credit(pg_temp.fid(92711),pg_temp.fid(92701),pg_temp.fid(92764),jsonb_set(pg_temp.input(92755),'{slots}',jsonb_build_array(pg_temp.input(92755)->'slots'->0,pg_temp.input(92755)->'slots'->0)))$q$,'22023','Distinct source absences required','one source cannot stamp multiple slots');
-- Under actual service role, arbitrary GUCs cannot manufacture a capability.
create temp table selected_session as select original_session_id id from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92752);
grant select on selected_session to service_role;
set local role service_role;
select lives_ok($q$select pg_temp.create_credit(92755,92774)$q$,'trusted service operation succeeds in same transaction');
select set_config('tutoring.absence_writer','true',true);
select throws_ok($q$update private.workspace_tutoring_sessions set attendance_status='DONE' where id=(select id from selected_session)$q$,'40001','Linked tutoring credit requires canonical operation','forged flag cannot mutate linked state');
select throws_ok($q$delete from private.workspace_tutoring_sessions where id=(select id from selected_session)$q$,'40001','Linked tutoring credit requires canonical operation','direct deletion cannot release claim');
select throws_ok($q$insert into private.tutoring_absence_write_permits values(pg_backend_pid(),txid_current(),'SESSION',(select id from selected_session),'00000000-0000-4000-8000-000000092799',1,'UPDATE','{}')$q$,'42501',null,'server cannot forge permit row');
select throws_ok($q$update private.workspace_tutoring_sessions set session_date='2029-12-31' where id=(select id from selected_session)$q$,'40001','Linked tutoring credit requires canonical operation','direct date edit cannot move makeup before source absence');
select throws_ok($q$update private.workspace_tutoring_sessions set start_time='13:00' where id=(select id from selected_session)$q$,'40001','Linked tutoring credit requires canonical operation','direct time edit requires future validated PATCH');
select throws_ok($q$update private.workspace_tutoring_sessions set duration_minutes=60 where id=(select id from selected_session)$q$,'40001','Linked tutoring credit requires canonical operation','direct duration edit requires future validated PATCH');
select throws_ok($q$update private.workspace_tutoring_sessions set teacher_user_id=null where id=(select id from selected_session)$q$,'40001','Linked tutoring credit requires canonical operation','direct teacher edit cannot bypass linked schedule validation');
select throws_ok($q$update private.workspace_tutoring_sessions set created_by=null where id=(select id from selected_session)$q$,'40001','Linked tutoring credit requires canonical operation','direct actor rewrite cannot erase creation attribution');
select throws_ok($q$update private.workspace_tutoring_sessions set created_at=created_at-interval '1 day' where id=(select id from selected_session)$q$,'40001','Linked tutoring credit requires canonical operation','direct timestamp rewrite cannot alter creation attribution');
select lives_ok($q$update private.workspace_tutoring_sessions set content='Synthetic metadata edit' where id=(select id from selected_session)$q$,'metadata-only edit remains possible');
reset role;
select is((select state from private.tutoring_absence_credits where original_attendance_id=pg_temp.fid(92752)),'RESERVED','metadata does not change credit state');
select is((select session_date from private.workspace_tutoring_sessions where id=(select id from selected_session)),'2030-01-04'::date,'rejected schedule edit preserves original makeup date');
select is((select created_by from private.workspace_tutoring_sessions where id=(select id from selected_session)),pg_temp.fid(92701),'rejected actor rewrite preserves original attribution');
select throws_ok($q$update public.user_group_attendance set status='PRESENT' where id=pg_temp.fid(92752)$q$,'40001','Source absence requires explicit credit resolution','direct correction cannot erase reservation');
select throws_ok($q$delete from public.user_group_attendance where id=pg_temp.fid(92752)$q$,'40001','Source absence requires explicit credit resolution','standalone source delete denied');
select * from finish();
rollback;
