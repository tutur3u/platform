-- Cross-device Pomodoro, v1 (design: apps/docs/build/development-tools/
-- mobile-pomodoro-cross-device.mdx).
--
-- The web route plans every transition with the pure TypeScript planner and
-- sends the planned state and session effects here; this function only checks
-- and applies them under the actor's tracker lock, with revision CAS and
-- command receipts. Nothing in the database starts a focus session on its own:
-- a `start` effect comes only from a user command, and no schedule calls this.
--
-- Also:
--   * replace_running_time_tracker_session keeps its behaviour, through a
--     shared locked helper that Pomodoro starts reuse with tags;
--   * configure_time_tracker_control keeps the focus session while a
--     Pomodoro runs;
--   * cloudflare_channel_role admits `time-tracker-pomodoro-<ws>-<actor>` for
--     the actor themself while a workspace MEMBER.
--
-- Rollback: apps/database/rollbacks/20261026194000_time_tracker_cross_device_pomodoro.rollback.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table private.time_tracker_controls
  drop constraint time_tracker_controls_mode_check,
  drop constraint time_tracker_controls_phase_check,
  drop constraint time_tracker_controls_deadline_at_check,
  add column remaining_ms integer not null default 0,
  add column completed_focus integer not null default 0,
  add column task_id uuid,
  add column title text,
  add constraint time_tracker_controls_mode_check
    check (mode in ('off', 'pomodoro')),
  add constraint time_tracker_controls_phase_check
    check (phase in ('idle', 'focus', 'short_break', 'long_break')),
  add constraint time_tracker_controls_remaining_ms_check
    check (remaining_ms between 0 and 180 * 60000),
  add constraint time_tracker_controls_completed_focus_check
    check (completed_focus between 0 and 100000),
  add constraint time_tracker_controls_title_check
    check (char_length(title) between 1 and 255),
  -- OFF keeps the foundation's inert shape (its prepared reference included).
  add constraint time_tracker_controls_phase_shape check (
    (mode = 'off' and phase = 'idle' and deadline_at is null
      and remaining_ms = 0 and completed_focus = 0
      and task_id is null and title is null)
    or (mode = 'pomodoro' and phase <> 'idle' and title is not null)
  );
comment on table private.time_tracker_controls is
  'Per-actor tracker control. OFF is inert; POMODORO is written only by private.command_time_tracker_pomodoro. Missed-entry, edit and approval writers remain outside it.';

-- Row locks in the foundation order: linked requests, sessions, breaks.
create function private._lock_time_tracker_actor_rows(p_ws_id uuid, p_actor_id uuid)
returns void language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
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
end;
$$;

-- Closes the running session and starts a new one. The caller holds the
-- actor's advisory lock and owns admission, revision CAS and receipts.
-- p_allow_open_breaks leaves other sessions' open breaks (a paused manual
-- timer) untouched instead of refusing.
create function private._replace_running_session_locked(
  p_ws_id uuid, p_actor_id uuid, p_expected_running_session_id uuid,
  p_title text, p_description text, p_category_id uuid, p_task_id uuid,
  p_tags text[], p_allow_open_breaks boolean
) returns jsonb language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_previous public.time_tracking_sessions%rowtype;
  v_now timestamptz;
  v_id uuid;
  v_update_limit text;
begin
  if p_tags is not null and (cardinality(p_tags) > 20 or exists(
    select 1 from unnest(p_tags) t where t is null or char_length(t) not between 1 and 50)) then
    raise exception 'Invalid timer operation' using errcode='22023';
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
  perform private._lock_time_tracker_actor_rows(p_ws_id,p_actor_id);
  if not coalesce(p_allow_open_breaks,false) and exists(select 1 from public.time_tracking_breaks b
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
  if p_tags is null then
    insert into public.time_tracking_sessions(ws_id,user_id,title,description,
      category_id,task_id,start_time,is_running,created_at,updated_at)
      values(p_ws_id,p_actor_id,p_title,p_description,p_category_id,p_task_id,
        v_now,true,v_now,v_now) returning id into v_id;
  else
    insert into public.time_tracking_sessions(ws_id,user_id,title,description,
      category_id,task_id,start_time,is_running,created_at,updated_at,tags)
      values(p_ws_id,p_actor_id,p_title,p_description,p_category_id,p_task_id,
        v_now,true,v_now,v_now,p_tags) returning id into v_id;
  end if;
  return jsonb_build_object('session_id',v_id,'closed_session_id',v_previous.id,
    'transition_at',v_now);
end;
$$;

-- Unchanged contract: admission, OFF check, receipts and CAS stay here.
create or replace function private.replace_running_time_tracker_session(
  p_ws_id uuid,p_actor_id uuid,p_expected_revision bigint,
  p_expected_running_session_id uuid,p_command_id uuid,p_title text,
  p_description text,p_category_id uuid,p_task_id uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_control private.time_tracker_controls%rowtype;
  v_scope private.time_tracker_operation_scopes%rowtype;
  v_receipt private.time_tracker_operation_receipts%rowtype;
  v_payload bytea;
  v_title text:=btrim(coalesce(p_title,''));
  v_description text:=nullif(btrim(coalesce(p_description,'')),'');
  v_replaced jsonb;
  v_result jsonb;
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
  v_replaced:=private._replace_running_session_locked(p_ws_id,p_actor_id,
    p_expected_running_session_id,v_title,v_description,p_category_id,p_task_id,
    null,false);
  update private.time_tracker_operation_scopes set revision=revision+1,
    updated_at=(v_replaced->>'transition_at')::timestamptz
    where ws_id=p_ws_id and actor_id=p_actor_id returning * into v_scope;
  v_result:=jsonb_build_object('operation','replace_running',
    'session_id',v_replaced->'session_id','closed_session_id',v_replaced->'closed_session_id',
    'applied_revision',v_scope.revision,'transition_at',v_replaced->'transition_at');
  insert into private.time_tracker_operation_receipts(ws_id,actor_id,command_id,payload_hash,applied_revision,result)
    values(p_ws_id,p_actor_id,p_command_id,v_payload,v_scope.revision,v_result);
  return v_result;
end;
$$;

-- As before, except that a running Pomodoro keeps its focus session.
create or replace function private.configure_time_tracker_control(
  p_ws_id uuid, p_actor_id uuid, p_expected_revision bigint,
  p_command_id uuid, p_config jsonb, p_prepared_session_id uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_control private.time_tracker_controls%rowtype;
  v_payload jsonb;
begin
  if not exists (select 1 from public.workspace_members m
    where m.ws_id=p_ws_id and m.user_id=p_actor_id and m.type='MEMBER') then
    raise exception 'Insufficient permissions' using errcode='42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_command_id is null
    or not private.valid_time_tracker_control_config(p_config) then
    raise exception 'Invalid control configuration' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':','time-tracker-control',p_ws_id,p_actor_id),0));
  select * into v_control from private.time_tracker_controls
    where ws_id=p_ws_id and actor_id=p_actor_id for update;
  v_payload := jsonb_build_object('expected_revision',p_expected_revision,
    'config',p_config,'prepared_session_id',p_prepared_session_id);
  if found and v_control.last_command_id=p_command_id then
    if v_control.last_command_payload <> v_payload then
      raise exception 'Control command conflict' using errcode='40001';
    end if;
    return to_jsonb(v_control) - 'last_command_payload' - 'last_command_id';
  end if;
  if (v_control.actor_id is null and p_expected_revision <> 0)
    or (v_control.actor_id is not null and v_control.revision <> p_expected_revision) then
    raise exception 'Control revision conflict' using errcode='40001';
  end if;
  if p_prepared_session_id is not null and v_control.mode is distinct from 'pomodoro' then
    perform 1 from public.time_tracking_sessions
      where id=p_prepared_session_id and ws_id=p_ws_id and user_id=p_actor_id
      for share;
    if not found then
      raise exception 'Prepared session unavailable' using errcode='22023';
    end if;
  end if;
  if v_control.actor_id is null then
    insert into private.time_tracker_controls(ws_id,actor_id,config,
      prepared_session_id,last_command_id,last_command_payload)
      values(p_ws_id,p_actor_id,p_config,p_prepared_session_id,p_command_id,v_payload)
      returning * into v_control;
  else
    -- A running Pomodoro owns the focus session reference.
    update private.time_tracker_controls set config=p_config,
      prepared_session_id=case when mode='pomodoro' then prepared_session_id
        else p_prepared_session_id end, revision=revision+1,
      last_command_id=p_command_id,last_command_payload=v_payload,updated_at=now()
      where ws_id=p_ws_id and actor_id=p_actor_id returning * into v_control;
  end if;
  return to_jsonb(v_control) - 'last_command_payload' - 'last_command_id';
end;
$$;

-- Applies one planned Pomodoro command. p_command is the client command
-- (type, title, taskId; no ids), hashed with the revision for replay.
-- p_next is the planner's state; p_effects its ordered session effects.
-- A pause or resume whose focus session ended or moved elsewhere turns the
-- Pomodoro OFF instead (`mismatch`); no effect ever touches a session that is
-- not the Pomodoro's own, and a running manual timer makes starts conflict.
create function private.command_time_tracker_pomodoro(
  p_ws_id uuid, p_actor_id uuid, p_expected_revision bigint, p_command_id uuid,
  p_command jsonb, p_next jsonb, p_effects jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_control private.time_tracker_controls%rowtype;
  v_receipt private.time_tracker_operation_receipts%rowtype;
  v_row public.time_tracking_sessions%rowtype;
  v_payload bytea;
  v_effect jsonb;
  v_kind text;
  v_session uuid;
  v_child uuid;
  v_new uuid;
  v_now timestamptz;
  v_end timestamptz;
  v_trim timestamptz;
  v_mismatch boolean:=false;
  v_phase text;
  v_deadline timestamptz;
  v_task uuid;
  v_title text;
  v_update_limit text;
  v_replaced jsonb;
  v_result jsonb;
begin
  if p_ws_id is null or p_actor_id is null or p_command_id is null
    or p_expected_revision is null or p_expected_revision<0
    or p_expected_revision=9223372036854775807
    or jsonb_typeof(p_command) is distinct from 'object'
    or p_command->>'type' is null
    or p_command->>'type' not in ('start','pause','resume','skip','stop','reconcile')
    or jsonb_typeof(p_next) is distinct from 'object'
    or jsonb_typeof(p_effects) is distinct from 'array'
    or jsonb_array_length(p_effects)>4 then
    raise exception 'Invalid Pomodoro command' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':','time-tracker-control',p_ws_id,p_actor_id),0));
  if not exists(select 1 from public.workspace_members m where m.ws_id=p_ws_id
    and m.user_id=p_actor_id and m.type='MEMBER') then
    raise exception 'Insufficient permissions' using errcode='42501';
  end if;
  select * into v_control from private.time_tracker_controls
    where ws_id=p_ws_id and actor_id=p_actor_id for update;
  if not found then
    raise exception 'Pomodoro control not configured' using errcode='55000';
  end if;
  -- The receipt is keyed by the command id and hashes the command only, so a
  -- retry replays even when it carries a revision that has since moved on
  -- (for example the 0 of the start that created the control).
  v_payload:=extensions.digest(jsonb_build_object('command',p_command)::text,'sha256');
  insert into private.time_tracker_operation_scopes(ws_id,actor_id)
    values(p_ws_id,p_actor_id) on conflict do nothing;
  perform 1 from private.time_tracker_operation_scopes
    where ws_id=p_ws_id and actor_id=p_actor_id for update;
  select * into v_receipt from private.time_tracker_operation_receipts
    where ws_id=p_ws_id and actor_id=p_actor_id and command_id=p_command_id;
  if found then
    if v_receipt.payload_hash<>v_payload then
      raise exception 'Pomodoro command conflict' using errcode='40001';
    end if;
    return v_receipt.result || jsonb_build_object('replayed',true);
  end if;
  if p_expected_revision<1 or v_control.revision<>p_expected_revision then
    raise exception 'Pomodoro revision conflict' using errcode='40001';
  end if;

  v_phase:=p_next->>'phase';
  v_now:=clock_timestamp();
  begin
    v_deadline:=(p_next->>'deadlineAt')::timestamptz;
    v_task:=(p_next->>'taskId')::uuid;
  exception when others then
    raise exception 'Invalid Pomodoro state' using errcode='22023';
  end;
  v_title:=nullif(btrim(coalesce(p_next->>'title','')),'');
  if v_phase is null or v_phase not in ('idle','focus','short_break','long_break')
    or jsonb_typeof(p_next->'remainingMs') is distinct from 'number'
    or jsonb_typeof(p_next->'completedFocus') is distinct from 'number'
    or (v_phase<>'idle' and v_title is null)
    or (v_deadline is not null and (v_phase='idle'
      or v_deadline not between v_now-interval '5 minutes' and v_now+interval '181 minutes')) then
    raise exception 'Invalid Pomodoro state' using errcode='22023';
  end if;
  if v_task is not null and not exists(select 1 from public.tasks t
    join public.task_lists l on l.id=t.list_id join public.workspace_boards b on b.id=l.board_id
    where t.id=v_task and b.ws_id=p_ws_id) then
    raise exception 'Task unavailable' using errcode='22023';
  end if;

  perform private._lock_time_tracker_actor_rows(p_ws_id,p_actor_id);
  -- The focus session, following resumes made elsewhere (each resume links
  -- only to the session right before it). Bounded, and only through this
  -- actor's sessions in this workspace.
  v_session:=v_control.prepared_session_id;
  for i in 1..64 loop
    exit when v_session is null;
    select s.id into v_child from public.time_tracking_sessions s
      where s.parent_session_id=v_session and s.ws_id=p_ws_id and s.user_id=p_actor_id
      order by s.start_time desc, s.id desc limit 1;
    exit when v_child is null;
    v_session:=v_child;
    v_child:=null;
  end loop;

  for v_effect in select value from jsonb_array_elements(p_effects) loop
    exit when v_mismatch;
    v_kind:=v_effect->>'kind';
    -- Nothing but a user command starts or resumes work: a `reconcile` may
    -- only stop a focus that ended, so the server never starts focus.
    if (v_kind='start' and p_command->>'type' not in ('start','resume','skip'))
      or (v_kind='resume' and p_command->>'type'<>'resume')
      or (v_kind='pause' and p_command->>'type'<>'pause') then
      raise exception 'Pomodoro effect not allowed for this command' using errcode='22023';
    end if;
    if v_kind in ('stop','pause','resume') and ((v_effect->>'sessionId') is null
      or (v_effect->>'sessionId') is distinct from v_control.prepared_session_id::text) then
      raise exception 'Pomodoro effect targets another session' using errcode='22023';
    end if;
    v_row:=null;
    if v_kind in ('stop','pause','resume') and v_session is not null then
      select * into v_row from public.time_tracking_sessions
        where id=v_session and ws_id=p_ws_id and user_id=p_actor_id for update;
    end if;
    v_update_limit:=coalesce(nullif(current_setting('time_tracking.bypass_update_limit',true),''),'off');
    perform set_config('time_tracking.bypass_update_limit','on',true);
    if v_kind='stop' then
      if v_row.id is not null and v_row.is_running then
        v_end:=v_now;
        begin
          v_trim:=(v_effect->>'trimToIfAfterStart')::timestamptz;
        exception when others then
          raise exception 'Invalid Pomodoro effect' using errcode='22023';
        end;
        if v_trim is not null and v_trim>v_row.start_time and v_trim<v_now then
          v_end:=v_trim;
        end if;
        update public.time_tracking_sessions set end_time=v_end,is_running=false,
          duration_seconds=extract(epoch from(v_end-v_row.start_time))::integer
          where id=v_row.id;
      elsif v_row.id is not null then
        update public.time_tracking_breaks set break_end=v_now
          where session_id=v_row.id and break_end is null;
      end if;
      v_session:=null;
    elsif v_kind='pause' then
      if v_row.id is null or not v_row.is_running then
        v_mismatch:=true;
      else
        update public.time_tracking_sessions set end_time=v_now,is_running=false,
          duration_seconds=extract(epoch from(v_now-v_row.start_time))::integer
          where id=v_row.id;
        insert into public.time_tracking_breaks(session_id,break_type_name,break_start,break_end,created_by)
          values(v_row.id,'Pomodoro',v_now,null,p_actor_id);
      end if;
    elsif v_kind='resume' then
      if v_row.id is null or v_row.is_running or not exists(select 1 from public.time_tracking_breaks
        where session_id=v_row.id and break_end is null) then
        v_mismatch:=true;
      elsif exists(select 1 from public.time_tracking_sessions where ws_id=p_ws_id
        and user_id=p_actor_id and is_running) then
        raise exception 'Timer running session conflict' using errcode='40001';
      else
        update public.time_tracking_breaks set break_end=v_now
          where session_id=v_row.id and break_end is null;
        insert into public.time_tracking_sessions(ws_id,user_id,title,description,category_id,
          task_id,start_time,is_running,was_resumed,parent_session_id,tags,created_at,updated_at)
          values(p_ws_id,p_actor_id,v_row.title,v_row.description,v_row.category_id,v_row.task_id,
            v_now,true,true,v_row.id,v_row.tags,v_now,v_now) returning id into v_new;
        v_session:=v_new;
      end if;
    elsif v_kind='start' then
      if jsonb_typeof(v_effect->'title') is distinct from 'string' then
        raise exception 'Invalid Pomodoro effect' using errcode='22023';
      end if;
      perform set_config('time_tracking.bypass_update_limit',v_update_limit,true);
      begin
        v_replaced:=private._replace_running_session_locked(p_ws_id,p_actor_id,null,
          left(btrim(v_effect->>'title'),500),null,null,(v_effect->>'taskId')::uuid,
          array['pomodoro'],true);
      exception when invalid_text_representation then
        raise exception 'Invalid Pomodoro effect' using errcode='22023';
      end;
      v_session:=(v_replaced->>'session_id')::uuid;
    else
      raise exception 'Invalid Pomodoro effect' using errcode='22023';
    end if;
    perform set_config('time_tracking.bypass_update_limit',v_update_limit,true);
  end loop;

  -- Session writes move the operation scope like every other session writer,
  -- so a replace planned before this command fails its CAS.
  if jsonb_array_length(p_effects)>0 then
    update private.time_tracker_operation_scopes set revision=revision+1,updated_at=v_now
      where ws_id=p_ws_id and actor_id=p_actor_id;
  end if;

  if v_mismatch or v_phase='idle' then
    update private.time_tracker_controls set mode='off',phase='idle',deadline_at=null,
      remaining_ms=0,completed_focus=0,task_id=null,title=null,prepared_session_id=null,
      revision=revision+1,last_command_id=p_command_id,
      last_command_payload=jsonb_build_object('revision',p_expected_revision,'command',p_command),
      updated_at=v_now
      where ws_id=p_ws_id and actor_id=p_actor_id returning * into v_control;
  else
    begin
      update private.time_tracker_controls set mode='pomodoro',phase=v_phase,
        deadline_at=v_deadline,remaining_ms=(p_next->>'remainingMs')::integer,
        completed_focus=(p_next->>'completedFocus')::integer,task_id=v_task,
        title=left(v_title,255),
        prepared_session_id=case when v_phase='focus' then v_session end,
        revision=revision+1,last_command_id=p_command_id,
        last_command_payload=jsonb_build_object('revision',p_expected_revision,'command',p_command),
        updated_at=v_now
        where ws_id=p_ws_id and actor_id=p_actor_id returning * into v_control;
    exception when check_violation or numeric_value_out_of_range or invalid_text_representation then
      raise exception 'Invalid Pomodoro state' using errcode='22023';
    end;
  end if;
  v_result:=(to_jsonb(v_control) - 'last_command_payload' - 'last_command_id' - 'config')
    || jsonb_build_object('mismatch',v_mismatch,'transition_at',v_now);
  insert into private.time_tracker_operation_receipts(ws_id,actor_id,command_id,payload_hash,applied_revision,result)
    values(p_ws_id,p_actor_id,p_command_id,v_payload,v_control.revision,v_result);
  return v_result || jsonb_build_object('replayed',false);
end;
$$;

-- Adds `time-tracker-pomodoro-<ws>-<actor>`; every other branch is unchanged.
create or replace function private.cloudflare_channel_role(p_actor uuid, p_topic text)
returns text language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_id uuid;
  v_ws uuid;
  v_board uuid;
  v_permission text;
  v_prefix text;
begin
  if p_actor is null or length(p_topic) > 180 then return null; end if;
  if p_topic = 'task-user-realtime-' || p_actor::text then return 'editor'; end if;
  if p_topic ~ '^time-tracker-pomodoro-[0-9a-f-]{36}-[0-9a-f-]{36}$' then
    v_ws := substring(p_topic from 23 for 36)::uuid;
    if substring(p_topic from 60 for 36)::uuid = p_actor and exists(
      select 1 from public.workspace_members where ws_id = v_ws and user_id = p_actor and type = 'MEMBER')
    then return 'editor'; end if;
    return null;
  end if;
  if p_topic ~ '^board-realtime-[0-9a-f-]{36}$' then
    v_id := substring(p_topic from 16)::uuid;
    select id, ws_id into v_board, v_ws from public.workspace_boards where id = v_id and deleted_at is null;
  elsif p_topic ~ '^task-editor-[0-9a-f-]{36}$' then
    v_id := substring(p_topic from 13)::uuid;
    select b.id, b.ws_id into v_board, v_ws
    from public.tasks t join public.task_lists l on l.id = t.list_id
    join public.workspace_boards b on b.id = l.board_id
    where t.id = v_id and t.deleted_at is null and b.deleted_at is null;
  elsif p_topic ~ '^form-studio-[0-9a-f-]{36}$' then
    if private.can_join_form_realtime_topic(p_topic, p_actor) then return 'editor'; end if;
    return null;
  elsif p_topic ~ '^ws-presence-[0-9a-f-]{36}$' then
    v_ws := substring(p_topic from 13)::uuid;
    if exists(select 1 from public.workspace_members where ws_id = v_ws and user_id = p_actor) then return 'editor'; end if;
    return null;
  elsif p_topic ~ '^whiteboard-[0-9a-f-]{36}-[0-9a-f-]{36}-(elements|cursors)$' then
    v_ws := substring(p_topic from 12 for 36)::uuid;
    v_id := substring(p_topic from 49 for 36)::uuid;
    if exists(select 1 from public.workspace_whiteboards w
      join public.workspace_members m on m.ws_id = w.ws_id
      where w.id = v_id and w.ws_id = v_ws and w.archived_at is null and m.user_id = p_actor)
    then return 'editor'; end if;
    return null;
  else return null;
  end if;
  if v_board is null then return null; end if;
  if exists(select 1 from public.workspace_members where ws_id = v_ws and user_id = p_actor and type = 'MEMBER') then
    if public.has_workspace_permission(v_ws, p_actor, 'manage_projects') then return 'editor'; end if;
    v_permission := 'viewer';
  end if;
  if exists(select 1 from public.task_board_shares s where s.board_id = v_board and s.permission = 'edit'
    and (s.shared_with_user_id = p_actor or lower(s.shared_with_email) =
      (select lower(email) from public.user_private_details where user_id = p_actor))) then return 'editor'; end if;
  if v_permission is not null then return v_permission; end if;
  if exists(select 1 from public.task_board_shares s where s.board_id = v_board
    and (s.shared_with_user_id = p_actor or lower(s.shared_with_email) =
      (select lower(email) from public.user_private_details where user_id = p_actor))) then return 'viewer'; end if;
  return null;
exception when invalid_text_representation then return null;
end $$;

revoke all on function private._lock_time_tracker_actor_rows(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private._replace_running_session_locked(uuid,uuid,uuid,text,text,uuid,uuid,text[],boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.command_time_tracker_pomodoro(uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function private.command_time_tracker_pomodoro(uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb)
  to service_role;

commit;
