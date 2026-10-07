-- UNWIRED OFF-only command boundary. Legacy writer closure remains OPEN.
create table private.time_tracker_operation_scopes (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references public.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  primary key (ws_id,actor_id)
);
create table private.time_tracker_operation_receipts (
  ws_id uuid not null,
  actor_id uuid not null,
  command_id uuid not null,
  payload_hash bytea not null check (octet_length(payload_hash)=32),
  applied_revision bigint not null check (applied_revision>0),
  result jsonb not null,
  primary key (ws_id,actor_id,command_id),
  foreign key (ws_id,actor_id) references private.time_tracker_operation_scopes(ws_id,actor_id) on delete cascade
);
alter table private.time_tracker_operation_scopes enable row level security;
alter table private.time_tracker_operation_receipts enable row level security;
revoke all on private.time_tracker_operation_scopes,private.time_tracker_operation_receipts
  from public,anon,authenticated,service_role;

create function private.replace_running_time_tracker_session(
  p_ws_id uuid,p_actor_id uuid,p_expected_revision bigint,
  p_expected_running_session_id uuid,p_command_id uuid,p_title text,
  p_description text,p_category_id uuid,p_task_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_control private.time_tracker_controls%rowtype;
  v_scope private.time_tracker_operation_scopes%rowtype;
  v_receipt private.time_tracker_operation_receipts%rowtype;
  v_previous public.time_tracking_sessions%rowtype;
  v_payload bytea;
  v_title text:=btrim(coalesce(p_title,''));
  v_description text:=nullif(btrim(coalesce(p_description,'')),'');
  v_now timestamptz;
  v_id uuid;
  v_result jsonb;
  v_update_limit text;
begin
  if p_ws_id is null or p_actor_id is null or p_command_id is null
    or p_expected_revision is null or p_expected_revision<0
    or p_expected_revision=9223372036854775807
    or length(v_title)>500 or length(v_description)>10000 then
    raise exception 'Invalid timer operation' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':','time-tracker-control',p_ws_id,p_actor_id),0));
  if not exists(select 1 from public.workspace_members m where m.ws_id=p_ws_id
    and m.user_id=p_actor_id and m.type='MEMBER') then
    raise exception 'Insufficient permissions' using errcode='42501';
  end if;
  -- Admission is checked even for a historical replay.
  select * into v_control from private.time_tracker_controls
    where ws_id=p_ws_id and actor_id=p_actor_id for update;
  if not found or v_control.mode<>'off' or v_control.phase<>'idle'
    or v_control.deadline_at is not null then
    raise exception 'OFF control required' using errcode='55000';
  end if;
  v_payload:=extensions.digest(jsonb_build_object('revision',p_expected_revision,
    'running_session_id',p_expected_running_session_id,'title',v_title,
    'description',v_description,'category_id',p_category_id,'task_id',p_task_id)::text,'sha256');
  insert into private.time_tracker_operation_scopes(ws_id,actor_id)
    values(p_ws_id,p_actor_id) on conflict do nothing;
  select * into v_scope from private.time_tracker_operation_scopes
    where ws_id=p_ws_id and actor_id=p_actor_id for update;
  select * into v_receipt from private.time_tracker_operation_receipts
    where ws_id=p_ws_id and actor_id=p_actor_id and command_id=p_command_id;
  if found then
    if v_receipt.payload_hash<>v_payload then
      raise exception 'Timer command conflict' using errcode='40001';
    end if;
    return v_receipt.result; -- Applied snapshot, not a current-state read.
  end if;
  if v_scope.revision<>p_expected_revision then
    raise exception 'Timer revision conflict' using errcode='40001';
  end if;
  if p_category_id is not null and not exists(select 1 from public.time_tracking_categories
    where id=p_category_id and ws_id=p_ws_id) then
    raise exception 'Category unavailable' using errcode='22023';
  end if;
  if p_task_id is not null and not exists(select 1 from public.tasks t
    join public.task_lists l on l.id=t.list_id join public.workspace_boards b on b.id=l.board_id
    where t.id=p_task_id and b.ws_id=p_ws_id) then
    raise exception 'Task unavailable' using errcode='22023';
  end if;
  -- Request-owner scope; approval callers must adopt this order before wiring.
  perform r.id from private.time_tracking_requests r join public.time_tracking_sessions s
    on s.id=r.linked_session_id where s.ws_id=p_ws_id and s.user_id=p_actor_id
    and s.is_running order by r.id for update of r;
  perform s.id from public.time_tracking_sessions s where s.ws_id=p_ws_id
    and s.user_id=p_actor_id and (s.is_running or exists(
      select 1 from public.time_tracking_breaks b where b.session_id=s.id
        and b.break_end is null)) order by s.id for update;
  perform b.id from public.time_tracking_breaks b join public.time_tracking_sessions s
    on s.id=b.session_id where s.ws_id=p_ws_id and s.user_id=p_actor_id
    and (s.is_running or b.break_end is null) order by b.id for update of b;
  if exists(select 1 from public.time_tracking_breaks b
    join public.time_tracking_sessions s on s.id=b.session_id
    where s.ws_id=p_ws_id and s.user_id=p_actor_id and b.break_end is null) then
    raise exception 'Open break must be resolved' using errcode='55000';
  end if;
  select * into v_previous from public.time_tracking_sessions
    where ws_id=p_ws_id and user_id=p_actor_id and is_running;
  if v_previous.id is distinct from p_expected_running_session_id then
    raise exception 'Timer running session conflict' using errcode='40001';
  end if;
  v_now:=clock_timestamp(); -- After contention, never a client/transaction-start clock.
  if v_previous.start_time>v_now then
    raise exception 'Running session starts in the future' using errcode='55000';
  end if;
  if v_previous.id is not null then
    v_update_limit:=coalesce(nullif(current_setting('time_tracking.bypass_update_limit',true),''),'off');
    begin
      perform set_config('time_tracking.bypass_update_limit','on',true);
      update public.time_tracking_sessions set end_time=v_now,is_running=false,
        duration_seconds=extract(epoch from(v_now-v_previous.start_time))::integer
        where id=v_previous.id and ws_id=p_ws_id and user_id=p_actor_id;
    exception when others then
      perform set_config('time_tracking.bypass_update_limit',v_update_limit,true);
      raise;
    end;
    perform set_config('time_tracking.bypass_update_limit',v_update_limit,true);
  end if;
  insert into public.time_tracking_sessions(ws_id,user_id,title,description,
    category_id,task_id,start_time,is_running,created_at,updated_at)
    values(p_ws_id,p_actor_id,v_title,v_description,p_category_id,p_task_id,
      v_now,true,v_now,v_now) returning id into v_id;
  update private.time_tracker_operation_scopes set revision=revision+1,updated_at=v_now
    where ws_id=p_ws_id and actor_id=p_actor_id returning * into v_scope;
  v_result:=jsonb_build_object('operation','replace_running','session_id',v_id,
    'closed_session_id',v_previous.id,'applied_revision',v_scope.revision,'transition_at',v_now);
  insert into private.time_tracker_operation_receipts(ws_id,actor_id,command_id,payload_hash,applied_revision,result)
    values(p_ws_id,p_actor_id,p_command_id,v_payload,v_scope.revision,v_result);
  return v_result;
end;
$$;
revoke all on function private.replace_running_time_tracker_session(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid)
  from public,anon,authenticated;
grant execute on function private.replace_running_time_tracker_session(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid)
  to service_role;
