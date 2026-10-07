-- Inert foundation: no API/UI activation and no historical credit backfill.
create table private.tutoring_absence_credits (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on update cascade on delete cascade,
  student_user_id uuid not null references public.workspace_users(id) on update cascade on delete cascade,
  session_id uuid references private.workspace_tutoring_sessions(id) on update cascade on delete set null,
  original_session_id uuid not null unique,
  attendance_id uuid references public.user_group_attendance(id) on update cascade on delete set null,
  original_attendance_id uuid not null,
  absence_date date not null,
  original_class_session_id uuid,
  class_session_id uuid references private.workspace_user_group_sessions(id) on update cascade on delete set null,
  state text not null check(state in ('RESERVED','CREDITED','RELEASED')),
  revision bigint not null default 1 check(revision > 0),
  created_by uuid not null,
  updated_by uuid not null,
  history jsonb not null default '[]' check(jsonb_typeof(history)='array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tutoring_absence_active_credit on private.tutoring_absence_credits(original_attendance_id)
  where state in ('RESERVED','CREDITED');
-- Full-history trigger lookup and every nullable/cascading FK need indexes.
create index tutoring_absence_original_attendance on private.tutoring_absence_credits(original_attendance_id);
create index tutoring_absence_workspace on private.tutoring_absence_credits(ws_id);
create index tutoring_absence_group on private.tutoring_absence_credits(group_id);
create index tutoring_absence_student on private.tutoring_absence_credits(student_user_id);
create index tutoring_absence_session on private.tutoring_absence_credits(session_id);
create index tutoring_absence_attendance on private.tutoring_absence_credits(attendance_id);
create index tutoring_absence_class_session on private.tutoring_absence_credits(class_session_id);
create table private.tutoring_absence_commands (
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  actor_id uuid not null,
  command_id uuid not null,
  input jsonb not null,
  receipt jsonb not null,
  primary key(ws_id,actor_id,command_id)
);
-- Only the definer operation can create a permit. No caller-owned setting is authority.
create table private.tutoring_absence_write_permits (
  backend_pid integer not null,
  transaction_id bigint not null,
  object_kind text not null check(object_kind in ('SESSION','ATTENDANCE')),
  object_id uuid not null,
  credit_id uuid not null,
  revision bigint not null,
  operation text not null,
  projection jsonb not null,
  primary key(backend_pid,transaction_id,object_kind,object_id)
);
alter table private.tutoring_absence_credits enable row level security;
alter table private.tutoring_absence_commands enable row level security;
alter table private.tutoring_absence_write_permits enable row level security;
revoke all on private.tutoring_absence_credits,private.tutoring_absence_commands,
  private.tutoring_absence_write_permits from public,anon,authenticated,service_role;

create function private.tutoring_absence_projection(p_row jsonb,p_kind text) returns jsonb
language sql immutable set search_path='' as $$
  select case when p_kind='SESSION' then jsonb_build_object(
    'id',p_row->'id','ws_id',p_row->'ws_id','group_id',p_row->'group_id',
    'student_user_id',p_row->'student_user_id','reason_type',p_row->'reason_type',
    'attendance_status',p_row->'attendance_status','session_date',p_row->'session_date',
    'start_time',p_row->'start_time','duration_minutes',p_row->'duration_minutes',
    'teacher_user_id',p_row->'teacher_user_id','created_by',p_row->'created_by','created_at',p_row->'created_at')
  else jsonb_build_object('id',p_row->'id','group_id',p_row->'group_id',
    'user_id',p_row->'user_id','date',p_row->'date','session_id',p_row->'session_id','status',p_row->'status') end;
$$;

create function private.guard_tutoring_absence_session() returns trigger
language plpgsql security definer set search_path='' as $$
declare c private.tutoring_absence_credits; r jsonb; projection jsonb; prior jsonb; fk_keys text[];
begin
  r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  select * into c from private.tutoring_absence_credits where original_session_id=
    case when tg_op='INSERT' then new.id else old.id end;
  if not found then return case when tg_op='DELETE' then old else new end; end if;
  -- Only actual parent deletion may use the existing FK cascade path.
  if tg_op='DELETE' and (
    not exists(select 1 from public.workspaces where id=c.ws_id)
    or not exists(select 1 from public.workspace_user_groups where id=c.group_id and ws_id=c.ws_id)
    or not exists(select 1 from public.workspace_users where id=c.student_user_id and ws_id=c.ws_id)
  ) then return old; end if;
  projection:=private.tutoring_absence_projection(r,'SESSION');
  if tg_op='UPDATE' then
    prior:=private.tutoring_absence_projection(to_jsonb(old),'SESSION');
    if projection=prior then return new; end if;
    fk_keys:='{}';
    -- RI actions run after the old parent disappears. Admit only the exact FK
    -- field change, with a valid replacement (or its declared SET NULL action).
    if old.teacher_user_id is distinct from new.teacher_user_id and old.teacher_user_id is not null
      and not exists(select 1 from public.workspace_users where id=old.teacher_user_id)
      and (new.teacher_user_id is null or exists(select 1 from public.workspace_users where id=new.teacher_user_id and ws_id=new.ws_id)) then
      fk_keys:=array_append(fk_keys,'teacher_user_id'); end if;
    if old.created_by is distinct from new.created_by and old.created_by is not null
      and not exists(select 1 from public.users where id=old.created_by)
      and (new.created_by is null or exists(select 1 from public.users where id=new.created_by)) then
      fk_keys:=array_append(fk_keys,'created_by'); end if;
    if old.ws_id<>new.ws_id and not exists(select 1 from public.workspaces where id=old.ws_id)
      and exists(select 1 from public.workspaces where id=new.ws_id) then fk_keys:=array_append(fk_keys,'ws_id'); end if;
    if old.group_id<>new.group_id and not exists(select 1 from public.workspace_user_groups where id=old.group_id)
      and exists(select 1 from public.workspace_user_groups where id=new.group_id and ws_id=new.ws_id) then
      fk_keys:=array_append(fk_keys,'group_id'); end if;
    if old.student_user_id<>new.student_user_id and not exists(select 1 from public.workspace_users where id=old.student_user_id)
      and exists(select 1 from public.workspace_users where id=new.student_user_id and ws_id=new.ws_id) then
      fk_keys:=array_append(fk_keys,'student_user_id'); end if;
    if cardinality(fk_keys)>0 and (projection-fk_keys)=(prior-fk_keys) then return new; end if;
  end if;
  if exists(select 1 from private.tutoring_absence_write_permits p
    where p.backend_pid=pg_backend_pid() and p.transaction_id=txid_current()
      and p.object_kind='SESSION' and p.object_id=c.original_session_id
      and p.credit_id=c.id and p.revision=c.revision and p.operation=tg_op
      and p.projection=projection) then return case when tg_op='DELETE' then old else new end; end if;
  raise exception 'Linked tutoring credit requires canonical operation' using errcode='40001';
end; $$;
create trigger tutoring_absence_session_guard before insert or update or delete
  on private.workspace_tutoring_sessions for each row execute function private.guard_tutoring_absence_session();

create function private.guard_tutoring_absence_attendance() returns trigger
language plpgsql security definer set search_path='' as $$
declare c private.tutoring_absence_credits; r jsonb; parent_removed boolean;
begin
  if tg_op='UPDATE' and private.tutoring_absence_projection(to_jsonb(old),'ATTENDANCE')
    =private.tutoring_absence_projection(to_jsonb(new),'ATTENDANCE') then return new; end if;
  r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  -- This query executes AFTER acquiring the attendance row lock. Do not mark
  -- the trigger STABLE or take a tutoring-session lock here (reverse ordering).
  for c in select * from private.tutoring_absence_credits where original_attendance_id=old.id loop
    parent_removed:=not exists(select 1 from public.workspaces where id=c.ws_id)
      or not exists(select 1 from public.workspace_user_groups where id=c.group_id and ws_id=c.ws_id)
      or not exists(select 1 from public.workspace_users where id=c.student_user_id and ws_id=c.ws_id)
      or not exists(select 1 from public.workspace_user_groups_users where group_id=c.group_id and user_id=c.student_user_id)
      or (old.session_id is not null and not exists(select 1 from private.workspace_user_group_sessions where id=old.session_id));
    if tg_op='DELETE' and parent_removed then
      if c.state='RESERVED' then
        update private.tutoring_absence_credits set state='RELEASED',revision=revision+1,
          updated_at=clock_timestamp(),history=history||jsonb_build_array(jsonb_build_object('operation','PARENT_REMOVED')) where id=c.id;
      end if;
      continue;
    end if;
    if tg_op='UPDATE' and old.session_id is distinct from new.session_id and old.session_id is not null
      and not exists(select 1 from private.workspace_user_group_sessions where id=old.session_id)
      and exists(select 1 from private.workspace_user_group_sessions where id=new.session_id and group_id=new.group_id)
      and (private.tutoring_absence_projection(to_jsonb(old),'ATTENDANCE')-'session_id')
        =(private.tutoring_absence_projection(to_jsonb(new),'ATTENDANCE')-'session_id') then continue; end if;
    if tg_op='UPDATE' and old.id=new.id and old.group_id=new.group_id and old.user_id=new.user_id
      and old.date=new.date and old.session_id is not distinct from new.session_id
      and (c.state='RELEASED' or lower(old.status)=lower(new.status)) then continue; end if;
    if exists(select 1 from private.tutoring_absence_write_permits p
      where p.backend_pid=pg_backend_pid() and p.transaction_id=txid_current()
        and p.object_kind='ATTENDANCE' and p.object_id=old.id and p.credit_id=c.id
        and p.revision=c.revision and p.operation=tg_op
        and p.projection=private.tutoring_absence_projection(r,'ATTENDANCE')) then continue; end if;
    raise exception 'Source absence requires explicit credit resolution' using errcode='40001';
  end loop;
  return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger tutoring_absence_attendance_guard before update or delete on public.user_group_attendance
  for each row execute function private.guard_tutoring_absence_attendance();

create function private.assert_tutoring_absence_actor(p_ws uuid,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.workspace_members where ws_id=p_ws and user_id=p_actor and type='MEMBER' for share;
  if not found then raise exception 'Tutoring credit forbidden' using errcode='42501'; end if;
  -- Hold existing permission rows until commit; permission recheck is a separate
  -- statement after lock waits, rather than a cached admission result.
  perform 1 from public.workspaces where id=p_ws for share;
  perform 1 from public.workspace_role_members where user_id=p_actor order by role_id for share;
  perform 1 from public.workspace_role_permissions where ws_id=p_ws order by role_id,permission for share;
  perform 1 from public.workspace_default_permissions where ws_id=p_ws order by permission for share;
  if public.has_workspace_permission(p_ws,p_actor,'update_user_groups_scores') is not true then
    raise exception 'Tutoring credit forbidden' using errcode='42501';
  end if;
end; $$;

create function private.read_tutoring_absence_credits(p_ws uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.workspace_members where ws_id=p_ws and user_id=p_actor and type='MEMBER';
  if not found or public.has_workspace_permission(p_ws,p_actor,'view_user_groups') is not true then
    raise exception 'Tutoring credit forbidden' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'groupId',group_id,'studentUserId',student_user_id,
    'sessionId',session_id,'sourceAttendanceId',original_attendance_id,'absenceDate',absence_date,
    'sourceSessionId',original_class_session_id,'state',state,'revision',revision::text) order by id)
    from private.tutoring_absence_credits where ws_id=p_ws),'[]'::jsonb);
end; $$;

create function private.manage_tutoring_absence_credit(p_ws uuid,p_actor uuid,p_command uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c private.tutoring_absence_credits; a public.user_group_attendance;
  s private.workspace_tutoring_sessions; previous private.tutoring_absence_commands;
  v_group uuid; v_student uuid; v_slot jsonb; v_id uuid; v_ids uuid[]:='{}';
  v_action text:=p_input->>'action'; v_source_ids uuid[]; v_teacher_ids uuid[]; v_now timestamptz:=clock_timestamp();
  v_state text; v_reason text; v_status text; v_revision bigint; v_receipt jsonb; projection jsonb;
begin
  if p_ws is null or p_actor is null or p_command is null or jsonb_typeof(p_input) is distinct from 'object'
    or v_action not in ('CREATE','TRANSITION','DELETE','RESOLVE') or v_action is null then
    raise exception 'Invalid tutoring credit input' using errcode='22023'; end if;
  perform private.assert_tutoring_absence_actor(p_ws,p_actor);
  perform pg_advisory_xact_lock(hashtextextended('tutoring-absence-command:'||p_ws||':'||p_actor||':'||p_command,0));
  select * into previous from private.tutoring_absence_commands
    where ws_id=p_ws and actor_id=p_actor and command_id=p_command;
  if found then
    if previous.input is distinct from p_input then raise exception 'Tutoring credit command conflict' using errcode='40001'; end if;
    return previous.receipt;
  end if;
  if v_action='CREATE' then
    v_group:=(p_input->>'groupId')::uuid; v_student:=(p_input->>'studentUserId')::uuid;
  else
    select * into c from private.tutoring_absence_credits where id=(p_input->>'creditId')::uuid and ws_id=p_ws;
    if not found then raise exception 'Tutoring credit unavailable' using errcode='P0002'; end if;
    v_group:=c.group_id; v_student:=c.student_user_id;
  end if;
  if v_group is null or v_student is null then raise exception 'Invalid tutoring credit input' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tutoring-absence-credit:'||p_ws||':'||v_group||':'||v_student,0));
  perform 1 from public.workspace_user_groups where id=v_group and ws_id=p_ws for share;
  if not found then raise exception 'Tutoring credit scope unavailable' using errcode='22023'; end if;
  perform 1 from public.workspace_users where id=v_student and ws_id=p_ws for share;
  if not found then raise exception 'Tutoring credit scope unavailable' using errcode='22023'; end if;
  -- Release/delete/resolve require tenant ownership, not continued enrollment.
  -- CREATE and transitions making an active claim additionally require enrollment.
  if v_action='CREATE' or (v_action='TRANSITION' and p_input->>'reasonType'='ABSENT_RECOVERY'
    and p_input->>'attendanceStatus' in ('PENDING','DONE') and c.state<>'CREDITED') then
    perform 1 from public.workspace_users where id=v_student and ws_id=p_ws and not archived for share;
    if not found then raise exception 'Tutoring credit scope unavailable' using errcode='22023'; end if;
    perform 1 from public.workspace_user_groups_users where group_id=v_group and user_id=v_student for share;
    if not found then raise exception 'Tutoring credit scope unavailable' using errcode='22023'; end if;
  end if;
  if v_action='CREATE' then
    if jsonb_typeof(p_input->'slots') is distinct from 'array' or jsonb_array_length(p_input->'slots') not between 1 and 50 then
      raise exception 'Invalid tutoring credit slots' using errcode='22023'; end if;
    select array_agg((x->>'sourceAttendanceId')::uuid order by (x->>'sourceAttendanceId')::uuid) into v_source_ids
      from jsonb_array_elements(p_input->'slots') x;
    if array_position(v_source_ids,null) is not null or cardinality(v_source_ids)
      <> (select count(distinct x) from unnest(v_source_ids) x) then
      raise exception 'Distinct source absences required' using errcode='22023'; end if;
    select array_agg(distinct (x->>'teacherUserId')::uuid order by (x->>'teacherUserId')::uuid) into v_teacher_ids
      from jsonb_array_elements(p_input->'slots') x;
    if array_position(v_teacher_ids,null) is not null then raise exception 'Tutoring teacher unavailable' using errcode='22023'; end if;
    perform 1 from public.workspace_users where id=any(v_teacher_ids) and ws_id=p_ws order by id for share;
    if (select count(*) from public.workspace_users where id=any(v_teacher_ids) and ws_id=p_ws)<>cardinality(v_teacher_ids) then
      raise exception 'Tutoring teacher unavailable' using errcode='22023'; end if;
    perform 1 from public.workspace_user_groups_users m join public.workspace_user_groups g on g.id=m.group_id
      where m.user_id=any(v_teacher_ids) and m.role='TEACHER' and g.ws_id=p_ws
      order by g.id,m.user_id for share of m,g;
    if (select count(distinct m.user_id) from public.workspace_user_groups_users m
      join public.workspace_user_groups g on g.id=m.group_id
      where m.user_id=any(v_teacher_ids) and m.role='TEACHER' and g.ws_id=p_ws)<>cardinality(v_teacher_ids) then
      raise exception 'Tutoring teacher unavailable' using errcode='22023'; end if;
    perform 1 from public.user_group_attendance where id=any(v_source_ids) order by id for update;
    v_now:=clock_timestamp();
    for v_slot in select x from jsonb_array_elements(p_input->'slots') x loop
      select * into a from public.user_group_attendance where id=(v_slot->>'sourceAttendanceId')::uuid;
      if not found or a.group_id<>v_group or a.user_id<>v_student or lower(a.status)<>'absent'
        or (v_slot->>'sessionDate')::date<a.date then
        raise exception 'Source absence unavailable' using errcode='22023'; end if;
      if exists(select 1 from private.tutoring_absence_credits where original_attendance_id=a.id and state in ('RESERVED','CREDITED')) then
        raise exception 'Source absence already credited' using errcode='40001'; end if;
      if (v_slot->>'teacherUserId') is null or (v_slot->>'sessionDate') is null or (v_slot->>'startTime') is null
        or (v_slot->>'durationMinutes') is null or (v_slot->>'durationMinutes') !~ '^[1-9][0-9]{0,2}$'
        or (v_slot->>'durationMinutes')::integer>480 then
        raise exception 'Invalid tutoring credit slot' using errcode='22023'; end if;
      v_id:=gen_random_uuid();
      insert into private.workspace_tutoring_sessions(id,ws_id,group_id,student_user_id,teacher_user_id,
        session_date,start_time,duration_minutes,reason_type,reason_detail,content,created_by)
      values(v_id,p_ws,v_group,v_student,(v_slot->>'teacherUserId')::uuid,(v_slot->>'sessionDate')::date,
        (v_slot->>'startTime')::time,(v_slot->>'durationMinutes')::integer,'ABSENT_RECOVERY',
        coalesce(v_slot->>'reasonDetail',''),coalesce(v_slot->>'content',''),p_actor);
      insert into private.tutoring_absence_credits(ws_id,group_id,student_user_id,session_id,original_session_id,
        attendance_id,original_attendance_id,absence_date,original_class_session_id,class_session_id,state,created_by,updated_by,history)
      values(p_ws,v_group,v_student,v_id,v_id,a.id,a.id,a.date,a.session_id,a.session_id,'RESERVED',p_actor,p_actor,
        jsonb_build_array(jsonb_build_object('operation','CREATE','actorId',p_actor,'at',v_now)));
      v_ids:=array_append(v_ids,v_id);
    end loop;
    v_receipt:=jsonb_build_object('ids',to_jsonb(v_ids),'createdCount',cardinality(v_ids));
  else
    -- Lock current source before session/credit; preliminary lookup is not admission.
    perform 1 from public.user_group_attendance where id=c.attendance_id for update;
    perform 1 from private.workspace_tutoring_sessions where id=c.session_id for update;
    select * into c from private.tutoring_absence_credits where id=c.id and ws_id=p_ws for update;
    v_now:=clock_timestamp();
    if (p_input->>'expectedRevision') is null or (p_input->>'expectedRevision') !~ '^[1-9][0-9]{0,18}$' then
      raise exception 'Invalid tutoring credit revision' using errcode='22023'; end if;
    if (p_input->>'expectedRevision')::numeric<>c.revision then raise exception 'Tutoring credit revision conflict' using errcode='40001'; end if;
    select * into s from private.workspace_tutoring_sessions where id=c.session_id;
    if not found then raise exception 'Tutoring session unavailable' using errcode='P0002'; end if;
    v_revision:=c.revision;
    if v_action='DELETE' then
      if c.state='CREDITED' or s.attendance_status not in ('PENDING','CANCELLED') then
        raise exception 'Credited tutoring history retained' using errcode='55000'; end if;
      projection:=private.tutoring_absence_projection(to_jsonb(s),'SESSION');
      insert into private.tutoring_absence_write_permits values(pg_backend_pid(),txid_current(),'SESSION',s.id,c.id,c.revision,'DELETE',projection);
      delete from private.workspace_tutoring_sessions where id=s.id;
      v_state:='RELEASED';
    elsif v_action='RESOLVE' then
      select * into a from public.user_group_attendance where id=c.attendance_id;
      if not found then raise exception 'Source absence unavailable' using errcode='22023'; end if;
      a.status:='PRESENT';
      projection:=private.tutoring_absence_projection(to_jsonb(a),'ATTENDANCE');
      -- Partial uniqueness means only this identity can be active; released
      -- historical records already permit status-only corrections.
      insert into private.tutoring_absence_write_permits
        select pg_backend_pid(),txid_current(),'ATTENDANCE',a.id,c.id,c.revision,'UPDATE',projection;
      update public.user_group_attendance set status='PRESENT' where id=a.id;
      v_state:=case when c.state='CREDITED' then 'CREDITED' else 'RELEASED' end;
    else
      v_status:=p_input->>'attendanceStatus'; v_reason:=p_input->>'reasonType';
      if v_status is null or v_status not in ('PENDING','DONE','NO_SHOW','CANCELLED')
        or v_reason is null or v_reason not in ('ABSENT_RECOVERY','WEAK_SUPPORT','CUSTOM') then
        raise exception 'Invalid tutoring credit transition' using errcode='22023'; end if;
      if c.state='CREDITED' and (v_status<>'DONE' or v_reason<>'ABSENT_RECOVERY') then
        raise exception 'Credited tutoring history retained' using errcode='55000'; end if;
      v_state:=case when v_reason<>'ABSENT_RECOVERY' or v_status in ('NO_SHOW','CANCELLED') then 'RELEASED'
        when v_status='DONE' then 'CREDITED' else 'RESERVED' end;
      if v_state in ('RESERVED','CREDITED') and c.state<>'CREDITED' then
        select * into a from public.user_group_attendance where id=c.attendance_id;
        if not found or lower(a.status)<>'absent' or a.group_id<>c.group_id or a.user_id<>c.student_user_id
          or a.date<>c.absence_date or a.session_id is distinct from c.class_session_id then
          raise exception 'Source absence unavailable' using errcode='22023'; end if;
        if exists(select 1 from private.tutoring_absence_credits where original_attendance_id=c.original_attendance_id
          and id<>c.id and state in ('RESERVED','CREDITED')) then raise exception 'Source absence already credited' using errcode='40001'; end if;
      end if;
      s.attendance_status:=v_status; s.reason_type:=v_reason;
      projection:=private.tutoring_absence_projection(to_jsonb(s),'SESSION');
      insert into private.tutoring_absence_write_permits values(pg_backend_pid(),txid_current(),'SESSION',s.id,c.id,c.revision,'UPDATE',projection);
      update private.workspace_tutoring_sessions set attendance_status=v_status,reason_type=v_reason,
        resolved_at=case when v_status='DONE' then coalesce(resolved_at,v_now) else null end where id=s.id;
    end if;
    delete from private.tutoring_absence_write_permits where backend_pid=pg_backend_pid() and transaction_id=txid_current() and credit_id=c.id;
    update private.tutoring_absence_credits set state=v_state,revision=revision+1,updated_by=p_actor,updated_at=v_now,
      history=history||jsonb_build_array(jsonb_build_object('operation',v_action,'state',v_state,'actorId',p_actor,'at',v_now)) where id=c.id;
    v_receipt:=jsonb_build_object('creditId',c.id,'state',v_state,'revision',(v_revision+1)::text,'sessionId',case when v_action='DELETE' then null else s.id end);
  end if;
  insert into private.tutoring_absence_commands values(p_ws,p_actor,p_command,p_input,v_receipt);
  return v_receipt;
end; $$;

revoke all on function private.tutoring_absence_projection(jsonb,text),private.guard_tutoring_absence_session(),
  private.guard_tutoring_absence_attendance(),private.assert_tutoring_absence_actor(uuid,uuid),
  private.read_tutoring_absence_credits(uuid,uuid),private.manage_tutoring_absence_credit(uuid,uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function private.read_tutoring_absence_credits(uuid,uuid),
  private.manage_tutoring_absence_credit(uuid,uuid,uuid,jsonb) to service_role;
comment on function private.manage_tutoring_absence_credit(uuid,uuid,uuid,jsonb) is
  'Unwired service-only selected-absence foundation; trusted backend actor only, no legacy backfill.';
