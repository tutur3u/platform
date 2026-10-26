-- Rollback for 20261026194000_time_tracker_cross_device_pomodoro.sql.
-- Not a migration: apply manually only with release-authority approval, then
-- record it with `supabase migration repair --status reverted 20261026194000`.
--
-- 1. Reset: every control returns to the inert OFF shape. Focus sessions stay
--    as ordinary `pomodoro`-tagged sessions; session rows are never touched.
-- 2. Restore: the 20261007020000, 20261010140100 and 20261004141204 bodies,
--    with the search_path 20261024025000 hardened them to; drop the new
--    functions, shape and columns; re-add the foundation's checks by name.
-- Pomodoro receipts stay in time_tracker_operation_receipts (results only).
-- Proof: apps/database/verification/time-tracker-pomodoro-rollback-roundtrip.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

update private.time_tracker_controls
   set mode = 'off', phase = 'idle', deadline_at = null,
       prepared_session_id = null, remaining_ms = 0, completed_focus = 0,
       task_id = null, title = null, updated_at = now()
 where mode <> 'off' or phase <> 'idle' or deadline_at is not null;

drop function private.command_time_tracker_pomodoro(uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb);

create or replace function private.replace_running_time_tracker_session(
  p_ws_id uuid,p_actor_id uuid,p_expected_revision bigint,
  p_expected_running_session_id uuid,p_command_id uuid,p_title text,
  p_description text,p_category_id uuid,p_task_id uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
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

drop function private._replace_running_session_locked(uuid,uuid,uuid,text,text,uuid,uuid,text[],boolean);
drop function private._lock_time_tracker_actor_rows(uuid,uuid);

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
  if p_prepared_session_id is not null then
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
    update private.time_tracker_controls set config=p_config,
      prepared_session_id=p_prepared_session_id, revision=revision+1,
      last_command_id=p_command_id,last_command_payload=v_payload,updated_at=now()
      where ws_id=p_ws_id and actor_id=p_actor_id returning * into v_control;
  end if;
  return to_jsonb(v_control) - 'last_command_payload' - 'last_command_id';
end;
$$;

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

alter table private.time_tracker_controls
  drop constraint time_tracker_controls_phase_shape,
  drop constraint time_tracker_controls_mode_check,
  drop constraint time_tracker_controls_phase_check,
  drop column remaining_ms,
  drop column completed_focus,
  drop column task_id,
  drop column title,
  add constraint time_tracker_controls_mode_check check (mode = 'off'),
  add constraint time_tracker_controls_phase_check check (phase = 'idle'),
  add constraint time_tracker_controls_deadline_at_check check (deadline_at is null);
comment on table private.time_tracker_controls is
  'INERT off-only preparation. Not consumed by tracker clients. Writer normalization and atomic accounting remain prerequisites.';

commit;
