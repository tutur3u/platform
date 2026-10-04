-- Drive owns bytes. This table stores owner-scoped pointers and execution metadata.
create table private.learn_playgrounds (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.users(id) on delete cascade,
  personal_ws_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  language text not null check (language in ('python','javascript','typescript','c','cpp','java','rust','go','ruby','php','shell')),
  revision integer not null default 0, drive_path text, file_manifest jsonb not null default '[]'::jsonb,
  command text not null default '', runner_id uuid references private.devbox_runners(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index learn_playgrounds_owner on private.learn_playgrounds(actor_id,created_at desc);
create table private.learn_playground_runs (
  run_id uuid primary key references private.devbox_runs(id) on delete cascade,
  project_id uuid not null references private.learn_playgrounds(id) on delete cascade,
  meeting_id uuid references public.workspace_meetings(id) on delete cascade,
  revision integer not null, operation text not null check(operation in ('run','stop','preview')),
  saved boolean not null default false, request_id uuid not null unique
);
alter table private.learn_playgrounds enable row level security;
alter table private.learn_playground_runs enable row level security;
revoke all on private.learn_playgrounds, private.learn_playground_runs from public,anon,authenticated;
grant select,insert,update,delete on private.learn_playgrounds, private.learn_playground_runs to service_role;
alter table private.devbox_runs drop constraint devbox_runs_workload_check;
alter table private.devbox_runs add constraint devbox_runs_workload_check
  check (workload in ('run','build','serve','tunnel','maintenance','judge','playground'));

create function private.read_learn_playgrounds(p_actor_id uuid, p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_ws uuid; v_result jsonb;
begin
  v_ws := private.account_personal_workspace(p_actor_id);
  if v_ws is null then raise exception 'Personal workspace missing' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(to_jsonb(project) order by project.created_at desc),'[]'::jsonb) into v_result
    from (select p.*, (select jsonb_build_object('id',r.id,'status',r.status)
      from private.learn_playground_runs j join private.devbox_runs r on r.id = j.run_id
      where j.project_id = p.id and j.operation in ('run','stop') and r.status in ('queued','running','cancel_requested')
      order by r.created_at desc limit 1) as active_run
      from private.learn_playgrounds p where p.actor_id = p_actor_id and p.personal_ws_id = v_ws
        and (p_id is null or p.id = p_id) order by p.created_at desc limit 20) project;
  return jsonb_build_object('personalWorkspaceId',v_ws,'allowed',private.account_playgrounds_allowed(p_actor_id),'projects',v_result);
end $$;

create function private.create_learn_playground(p_actor_id uuid, p_name text, p_language text,p_meeting_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ws uuid;
begin
  if not private.account_playgrounds_allowed(p_actor_id) and not private.meeting_programming_elevated(p_meeting_id,p_actor_id) then raise insufficient_privilege; end if;
  v_ws := private.account_personal_workspace(p_actor_id);
  if v_ws is null then raise exception 'Personal workspace missing' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 21));
  if (select count(*) from private.learn_playgrounds where actor_id = p_actor_id) >= 20 then
    raise exception 'Project limit' using errcode = '22023'; end if;
  insert into private.learn_playgrounds(actor_id,personal_ws_id,name,language) values(p_actor_id,v_ws,p_name,p_language) returning id into v_id;
  return v_id;
end $$;

-- A failed initial template upload must not consume the owner's project quota.
-- Published or concurrently edited projects are deliberately retained.
create function private.discard_uninitialized_playground(p_actor_id uuid,p_id uuid) returns boolean
language sql security definer set search_path = '' as $$
  with discarded as (
    delete from private.learn_playgrounds
    where actor_id=p_actor_id and id=p_id and revision=0 and drive_path is null
      and not exists(select 1 from private.learn_playground_runs where project_id=p_id)
    returning id
  ) select exists(select 1 from discarded)
$$;
revoke all on function private.discard_uninitialized_playground(uuid,uuid) from public,anon,authenticated;
grant execute on function private.discard_uninitialized_playground(uuid,uuid) to service_role;

create function private.publish_learn_playground(p_actor_id uuid,p_id uuid,p_revision integer,p_path text,p_command text,p_manifest jsonb,p_run_id uuid default null,p_meeting_id uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_project private.learn_playgrounds; v_revision integer;
begin
  select * into v_project from private.learn_playgrounds where id = p_id and actor_id = p_actor_id for update;
  if not found then raise exception 'Project missing' using errcode = 'P0002'; end if;
  if not private.account_playgrounds_allowed(p_actor_id) and not private.meeting_programming_elevated(p_meeting_id,p_actor_id) then raise insufficient_privilege; end if;
  if v_project.personal_ws_id is distinct from private.account_personal_workspace(p_actor_id) then raise insufficient_privilege; end if;
  if p_path !~ ('^playgrounds/' || p_id::text || '/[0-9a-f-]{36}$') or length(p_command) not between 1 and 4096 then
    raise exception 'Invalid save' using errcode = '22023'; end if;
  if p_run_id is not null then
    -- The callback uses its current run revision; repeated content is a no-op.
    if not exists(select 1 from private.learn_playground_runs j join private.devbox_runs r on r.id = j.run_id
      where j.run_id = p_run_id and j.project_id = p_id and j.revision = p_revision and j.operation = 'run' and r.status = 'running') then raise insufficient_privilege; end if;
  elsif exists(select 1 from private.learn_playground_runs j join private.devbox_runs r on r.id = j.run_id
    where j.project_id = p_id and r.status in ('queued','running','cancel_requested')) then
    raise exception 'Project busy' using errcode = '40001';
  end if;
  if v_project.revision <> p_revision then raise exception 'Save conflict' using errcode = '40001'; end if;
  if jsonb_typeof(p_manifest) <> 'array' or jsonb_array_length(p_manifest)>128 then raise exception 'Invalid manifest' using errcode='22023'; end if;
  if v_project.file_manifest = p_manifest and v_project.command = p_command then
    if p_run_id is not null then update private.learn_playground_runs set saved=true where run_id=p_run_id; end if;
    return v_project.revision;
  end if;
  update private.learn_playgrounds set drive_path=p_path,file_manifest=p_manifest,command=p_command,revision=revision+1,updated_at=now()
    where id=p_id returning revision into v_revision;
  if p_run_id is not null then update private.learn_playground_runs set saved=true,revision=v_revision where run_id=p_run_id; end if;
  return v_revision;
end $$;

create function private.enqueue_learn_playground(p_actor_id uuid,p_id uuid,p_revision integer,p_operation text,p_command text[],p_request_id uuid,p_meeting_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_project private.learn_playgrounds; v_runner uuid; v_lease uuid; v_run uuid; v_language text;
begin
  if not private.account_playgrounds_allowed(p_actor_id) and not private.meeting_programming_elevated(p_meeting_id,p_actor_id) then raise insufficient_privilege; end if;
  select * into v_project from private.learn_playgrounds where id=p_id and actor_id=p_actor_id for update;
  if not found then raise exception 'Project missing' using errcode='P0002'; end if;
  if v_project.personal_ws_id is distinct from private.account_personal_workspace(p_actor_id) then raise insufficient_privilege; end if;
  select j.run_id into v_run from private.learn_playground_runs j join private.devbox_runs r on r.id=j.run_id
    where j.request_id=p_request_id and j.project_id=p_id and r.actor_id=p_actor_id;
  if v_run is not null then return v_run; end if;
  if v_project.revision<>p_revision or v_project.drive_path is null then raise exception 'Save first' using errcode='40001'; end if;
  if p_operation not in ('run','stop','preview') or p_command[1]<>'__ttr_playground_v1__'
    or cardinality(p_command)<>2 or length(p_command[2])>4000000 then raise exception 'Invalid job' using errcode='22023'; end if;
  if p_operation='run' and exists(select 1 from private.learn_playground_runs j join private.devbox_runs r on r.id=j.run_id
    where j.project_id=p_id and r.status in ('queued','running','cancel_requested')) then raise exception 'Project busy' using errcode='40001'; end if;
  if (select count(*) from private.learn_playground_runs j join private.devbox_runs r on r.id=j.run_id
    where r.actor_id=p_actor_id and r.status in ('queued','running','cancel_requested')) >= 4 then
    raise exception 'Too many pending jobs' using errcode='53300'; end if;
  -- Platform operators explicitly opt in. Customer runner registration never supplies this pool.
  select runner.id into v_runner from private.devbox_runners runner
    where runner.status='online' and runner.heartbeat_enabled and runner.last_heartbeat_at>now()-interval '90 seconds'
      and runner.enabled_features->>'playground'='true' and runner.capabilities#>>'{playground,ready}'='true'
      and (runner.capabilities#>'{playground,languages}') ? v_project.language
      and (p_operation='run' or runner.id=v_project.runner_id)
    order by (runner.id=v_project.runner_id) desc nulls last,
      (select count(*) from private.devbox_runs r where r.runner_id=runner.id and r.status='running'), runner.id limit 1;
  if v_runner is null then raise exception 'No ready playground runner' using errcode='53300'; end if;
  insert into private.devbox_leases(actor_id,runner_id,status,expires_at,keep)
    values(p_actor_id,v_runner,'active',now()+interval '5 minutes',false) returning id into v_lease;
  insert into private.devbox_runs(actor_id,lease_id,command,workload,timeout_seconds)
    values(p_actor_id,v_lease,p_command,'playground',120) returning id into v_run;
  insert into private.learn_playground_runs(run_id,project_id,revision,operation,request_id,meeting_id) values(v_run,p_id,p_revision,p_operation,p_request_id,p_meeting_id);
  update private.learn_playgrounds set runner_id=v_runner where id=p_id;
  return v_run;
end $$;

create function private.read_learn_playground_run(p_actor_id uuid,p_id uuid,p_run_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('runId',r.id,'status',r.status,'exitCode',r.exit_code,'revision',p.revision,'saved',j.saved,
    'output',coalesce((select string_agg(e.message,E'\n' order by e.created_at,e.id) from private.devbox_run_events e
      where e.run_id=r.id and e.event_type in ('playground_output','error')),''),
    'preview',(select e.message from private.devbox_run_events e where e.run_id=r.id and e.event_type='playground_preview' order by e.created_at desc limit 1))
  from private.learn_playground_runs j join private.learn_playgrounds p on p.id=j.project_id join private.devbox_runs r on r.id=j.run_id
  where p.id=p_id and p.actor_id=p_actor_id and r.actor_id=p_actor_id and r.id=p_run_id
$$;
create function private.authorize_playground_callback(p_runner_id uuid,p_run_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('actorId',p.actor_id,'projectId',p.id,'revision',j.revision,'command',p.command,'jobCommand',r.command,'saved',j.saved,'meetingId',j.meeting_id)
  from private.learn_playground_runs j join private.learn_playgrounds p on p.id=j.project_id join private.devbox_runs r on r.id=j.run_id
  where r.id=p_run_id and r.runner_id=p_runner_id and r.status='running' and j.operation='run'
$$;
revoke all on function private.read_learn_playgrounds(uuid,uuid),private.create_learn_playground(uuid,text,text,uuid),
 private.publish_learn_playground(uuid,uuid,integer,text,text,jsonb,uuid,uuid),private.enqueue_learn_playground(uuid,uuid,integer,text,text[],uuid,uuid),
 private.read_learn_playground_run(uuid,uuid,uuid),private.authorize_playground_callback(uuid,uuid) from public,anon,authenticated;
grant execute on function private.read_learn_playgrounds(uuid,uuid),private.create_learn_playground(uuid,text,text,uuid),
 private.publish_learn_playground(uuid,uuid,integer,text,text,jsonb,uuid,uuid),private.enqueue_learn_playground(uuid,uuid,integer,text,text[],uuid,uuid),
 private.read_learn_playground_run(uuid,uuid,uuid),private.authorize_playground_callback(uuid,uuid) to service_role;
