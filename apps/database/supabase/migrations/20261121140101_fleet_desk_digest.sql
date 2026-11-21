begin;

create index fleet_digest_question_quota on private.fleet_audit_events (actor_id, created_at)
where action = 'digest.read' and reason_code = 'accepted';

-- tuturuuu: no-grant (internal)
create function private.fleet_question_usage(p_actor uuid, p_at timestamptz)
returns bigint
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select
    (select count(*) from private.fleet_intents
     where requester_id = p_actor and kind = 'status_question'
       and created_at > p_at - interval '1 hour')
    + (select count(*) from private.fleet_audit_events
       where actor_id = p_actor and action = 'digest.read' and reason_code = 'accepted'
         and created_at > p_at - interval '1 hour');
$$;
revoke all on function private.fleet_question_usage(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.fleet_admit_intent()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_control private.fleet_control%rowtype;
  v_grant private.fleet_access_grants%rowtype;
  v_project record;
  v_project_count integer := 0;
  v_usage bigint;
  v_capability text;
begin
  select * into v_control from private.fleet_control for share;
  if not found or v_control.stopped then
    raise exception 'Fleet is stopped' using errcode = 'PF001';
  end if;

  -- Write the per-person row before counting. A concurrent waiter sees the
  -- committed intent at READ COMMITTED, or receives a serialization failure
  -- at stronger isolation. Replacing a grant preserves the person's usage.
  update private.fleet_access_grants
  set generation = generation
  where user_id = new.requester_id and auth_user_id = new.requester_id and revoked_at is null
  returning * into v_grant;

  new.created_at := clock_timestamp();
  if not found or v_grant.expires_at <= new.created_at then
    raise exception 'Live Fleet grant required' using errcode = 'PF002';
  end if;

  v_capability := case new.kind
    when 'status_question' then 'ask'
    when 'approve.item' then 'approve.low'
    else new.kind::text
  end;
  new.requires_owner_approval := not (v_capability = any (v_grant.capabilities));
  if v_capability is null or (
    new.requires_owner_approval and (
      new.kind = 'status_question' or not ('intent.request' = any (v_grant.capabilities))
    )
  ) then
    raise exception 'Fleet request capability required' using errcode = 'PF003';
  end if;

  if new.project_versions is null or jsonb_typeof(new.project_versions) <> 'object'
    or new.project_versions = '{}'::jsonb then
    raise exception 'Fleet requests require authoritative projects' using errcode = 'PF004';
  end if;

  for v_project in
    select p.key, p.target_mapping_version
    from private.fleet_projects p
    join private.fleet_access_grant_projects gp on gp.project_key = p.key
    where gp.user_id = new.requester_id and new.project_versions ? p.key
    order by p.key
    for share of p, gp
  loop
    if new.project_versions -> v_project.key is distinct from to_jsonb(v_project.target_mapping_version) then
      raise exception 'Fleet project mapping changed' using errcode = 'PF005';
    end if;
    v_project_count := v_project_count + 1;
  end loop;
  if v_project_count <> (select count(*) from jsonb_object_keys(new.project_versions)) then
    raise exception 'Fleet project outside grant scope' using errcode = 'PF004';
  end if;

  if new.kind = 'status_question' then
    v_usage := private.fleet_question_usage(new.requester_id, new.created_at);
    if v_usage >= v_grant.questions_per_hour then
      raise exception 'Fleet hourly question quota exhausted' using errcode = 'PF006';
    end if;
  else
    select count(*) into v_usage from private.fleet_intents
    where requester_id = new.requester_id and kind <> 'status_question'
      and created_at > new.created_at - interval '24 hours';
    if v_usage >= v_grant.intents_per_day then
      raise exception 'Fleet daily intent quota exhausted' using errcode = 'PF007';
    end if;
  end if;

  new.requester_generation := v_grant.generation;
  new.stop_generation := v_control.generation;
  new.expires_at := new.created_at + interval '72 hours';
  new.risk := case new.kind
    when 'status_question' then 'none'
    when 'comment' then 'low'
    when 'priority.set' then 'low'
    when 'approve.item' then 'low'
    when 'work.create' then 'medium'
    when 'work.redirect' then 'medium'
    else 'high'
  end;
  new.approver_id := null;
  new.approver_generation := null;
  new.lease_id := null;
  new.lease_expires_at := null;
  new.receipt := null;
  new.idempotency_key := gen_random_uuid();
  new.state := 'pending_approval';

  -- Desk credentials file requests only. Self-approval needs a signed-in
  -- web or mobile session.
  if not new.requires_owner_approval then
    if new.kind in ('status_question', 'comment') then
      new.state := 'approved';
    elsif new.channel in ('web', 'mobile') and new.risk in ('low', 'medium')
      and 'approve.low' = any (v_grant.capabilities) then
      new.state := 'approved';
      new.approver_id := new.requester_id;
      new.approver_generation := new.requester_generation;
    end if;
  end if;
  return new;
end;
$$;
-- tuturuuu: no-grant (internal)
create function private.fleet_digest_sections(p_project_keys text[])
returns jsonb
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'projectKey', d.project_key,
      'generatedAt', to_char(d.generated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'receivedAt', to_char(d.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'stale', d.received_at <= statement_timestamp() - interval '1 hour',
      'lanes', d.lanes
    ) order by d.project_key
  ), '[]'::jsonb)
  from private.fleet_project_digests d
  where d.project_key = any (p_project_keys)
    and private.fleet_digest_labels_approved(d.project_key, d.lanes);
$$;
revoke all on function private.fleet_digest_sections(text[])
  from public, anon, authenticated, service_role;

create or replace function private.fleet_get_digest(p_actor_id uuid)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select case when (access.data -> 'enabled') = 'true'::jsonb
    and (access.data -> 'capabilities') ? 'status.read'
    then private.fleet_digest_sections(array(
      select jsonb_array_elements_text(access.data -> 'projects')
    ))
    end
  from (select private.fleet_get_access(p_actor_id) as data) as access;
$$;

create function private.fleet_read_desk_digest(p_event jsonb)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reason text;
  v_actor uuid;
  v_grant private.fleet_access_grants%rowtype;
  v_at timestamptz;
  v_sections jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege;
  end if;
  v_reason := private.fleet_admit_desk_event(p_event, 'digest.read');
  if v_reason is not null then
    return jsonb_build_object('reason', v_reason);
  end if;

  v_actor := private.fleet_linked_desk_actor(p_event);
  if v_actor is null then
    v_reason := 'unlinked_identity';
  elsif (select stopped from private.fleet_control) is distinct from false then
    v_reason := 'fleet_stopped';
  else
    -- Serialize the rolling quota with status-question intent admissions.
    update private.fleet_access_grants set generation = generation
    where user_id = v_actor and auth_user_id = v_actor and revoked_at is null
    returning * into v_grant;
    v_at := clock_timestamp();
    if not found or v_grant.expires_at <= v_at then
      v_reason := 'inactive_grant';
    elsif not ('status.read' = any (v_grant.capabilities)) then
      v_reason := 'missing_capability';
    elsif private.fleet_question_usage(v_actor, v_at) >= v_grant.questions_per_hour then
      v_reason := 'questions_per_hour';
    else
      v_sections := private.fleet_digest_sections(array(
        select gp.project_key from private.fleet_access_grant_projects gp where gp.user_id = v_actor
      ));
      v_reason := 'accepted';
    end if;
  end if;

  insert into private.fleet_audit_events (actor_id, channel, action, reason_code, created_at)
    values (v_actor, p_event ->> 'channel', 'digest.read', v_reason, clock_timestamp());
  if v_sections is not null then
    return jsonb_build_object('reason', v_reason, 'sections', v_sections);
  end if;
  return jsonb_build_object('reason', v_reason);
end;
$$;
revoke all on function private.fleet_read_desk_digest(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.fleet_read_desk_digest(jsonb) to service_role;

commit;
