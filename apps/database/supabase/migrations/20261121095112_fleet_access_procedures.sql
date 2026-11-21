begin;

-- The database-owner connection is reserved for Owner management. The verified
-- user identity comes from the authenticated request context, never an actor argument.
-- tuturuuu: no-grant (internal)
create function private.fleet_require_owner()
returns uuid
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_root constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if session_user::text in ('authenticator', 'anon', 'authenticated', 'service_role')
    or not pg_has_role(session_user, 'postgres', 'MEMBER') then
    raise exception 'Fleet management requires a database owner session' using errcode = '42501';
  end if;

  select owner_user_id into v_owner from private.fleet_control for update;
  if auth.role() is distinct from 'authenticated'
    or v_actor is null or v_actor is distinct from v_owner then
    raise exception 'Fleet Owner access required' using errcode = '42501';
  end if;

  -- Lock the explicit permission and membership through the audited mutation.
  perform 1
  from auth.users u
  join public.workspace_members m on m.user_id = u.id and m.ws_id = v_root and m.type = 'MEMBER'
  join public.workspace_role_members rm on rm.user_id = u.id
  join private.mastermind_access_role mr on mr.role_id = rm.role_id
  join public.workspace_roles r on r.id = mr.role_id and r.ws_id = v_root
  join public.workspace_role_permissions rp on rp.role_id = r.id and rp.ws_id = v_root
  where u.id = v_actor and rp.permission = 'manage_mastermind' and rp.enabled
  for share of u, m, rm, mr, r, rp;

  if not found then
    raise exception 'Fleet Owner access required' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;
revoke all on function private.fleet_require_owner() from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
create function private.fleet_grant_access(
  p_user_id uuid,
  p_tier private.fleet_tier,
  p_capabilities text[],
  p_project_keys text[],
  p_reason_code text,
  p_expires_at timestamptz default null,
  p_questions_per_hour integer default 30,
  p_intents_per_day integer default 10,
  p_model_budget_per_month bigint default 0
)
returns bigint
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := private.fleet_require_owner();
  v_generation bigint;
begin
  if coalesce(array_ndims(p_project_keys), 0) <> 1
    or (p_expires_at is not null and p_expires_at <= clock_timestamp()) then
    raise exception 'Fleet grants require projects and a future expiry if set' using errcode = '23514';
  end if;

  insert into private.fleet_access_grants as g (
    user_id, tier, capabilities, expires_at, questions_per_hour, intents_per_day, model_budget_per_month
  ) values (
    p_user_id, p_tier, p_capabilities, p_expires_at, p_questions_per_hour, p_intents_per_day,
    p_model_budget_per_month
  )
  on conflict (user_id) do update
  set auth_user_id = excluded.auth_user_id, tier = excluded.tier, capabilities = excluded.capabilities, expires_at = excluded.expires_at,
      questions_per_hour = excluded.questions_per_hour, intents_per_day = excluded.intents_per_day,
      model_budget_per_month = excluded.model_budget_per_month, revoked_at = null,
      generation = g.generation + 1
  returning generation into v_generation;

  delete from private.fleet_access_grant_projects where user_id = p_user_id;
  insert into private.fleet_access_grant_projects (user_id, project_key)
    select p_user_id, project_key from unnest(p_project_keys) as project_key;
  insert into private.fleet_audit_events (actor_id, channel, action, reason_code, subject_user_id)
    values (v_actor, 'web', 'access.grant', p_reason_code, p_user_id);
  return v_generation;
end;
$$;
revoke all on function private.fleet_grant_access(uuid, private.fleet_tier, text[], text[], text, timestamptz, integer, integer, bigint)
  from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
create function private.fleet_revoke_access(p_user_id uuid, p_reason_code text)
returns bigint
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := private.fleet_require_owner();
  v_generation bigint;
begin
  update private.fleet_access_grants
  set revoked_at = coalesce(revoked_at, clock_timestamp())
  where user_id = p_user_id
  returning generation into v_generation;

  insert into private.fleet_audit_events (actor_id, channel, action, reason_code, subject_user_id)
    values (v_actor, 'web', 'access.revoke', p_reason_code, p_user_id);
  return v_generation;
end;
$$;
revoke all on function private.fleet_revoke_access(uuid, text) from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
create function private.fleet_set_stopped(p_stopped boolean, p_reason_code text)
returns bigint
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := private.fleet_require_owner();
  v_generation bigint;
begin
  update private.fleet_control
  set stopped = p_stopped
  returning generation into v_generation;

  insert into private.fleet_audit_events (actor_id, channel, action, reason_code)
    values (v_actor, 'web', case when p_stopped then 'fleet.stop' else 'fleet.resume' end, p_reason_code);
  return v_generation;
end;
$$;
revoke all on function private.fleet_set_stopped(boolean, text) from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (trigger)
create function private.fleet_admit_intent()
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
    select count(*) into v_usage from private.fleet_intents
    where requester_id = new.requester_id and kind = 'status_question'
      and created_at > new.created_at - interval '1 hour';
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

  if not new.requires_owner_approval then
    if new.kind in ('status_question', 'comment') then
      new.state := 'approved';
    elsif new.risk in ('low', 'medium') and 'approve.low' = any (v_grant.capabilities) then
      new.state := 'approved';
      new.approver_id := new.requester_id;
      new.approver_generation := new.requester_generation;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.fleet_admit_intent() from public, anon, authenticated, service_role;

create trigger fleet_admit_intent
before insert on private.fleet_intents
for each row execute function private.fleet_admit_intent();

-- This internal entry point trusts the server to resolve the actor and action.
-- The insert guard independently checks the current grant, scope and quotas.
create function private.fleet_submit_intent(
  p_actor_id uuid,
  p_channel text,
  p_kind private.fleet_intent_kind,
  p_payload jsonb,
  p_action_hash bytea,
  p_project_versions jsonb,
  p_redacted_quote text default null
)
returns table (intent_id uuid, reason_code text)
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' or p_actor_id is null then
    raise exception 'Trusted Fleet submission required' using errcode = '42501';
  end if;

  begin
    insert into private.fleet_intents (requester_id, channel, kind, payload, action_hash, project_versions)
      values (p_actor_id, p_channel, p_kind, p_payload, p_action_hash, p_project_versions)
      returning id into intent_id;
    if p_redacted_quote is not null then
      insert into private.fleet_intent_quotes (intent_id, redacted_quote)
        values (intent_id, p_redacted_quote);
    end if;
    reason_code := 'accepted';
  exception
    when sqlstate 'PF001' then reason_code := 'fleet_stopped';
    when sqlstate 'PF002' then reason_code := 'inactive_grant';
    when sqlstate 'PF003' then reason_code := 'missing_capability';
    when sqlstate 'PF004' then reason_code := 'project_outside_grant';
    when sqlstate 'PF005' then reason_code := 'stale_project_mapping';
    when sqlstate 'PF006' then reason_code := 'questions_per_hour';
    when sqlstate 'PF007' then reason_code := 'intents_per_day';
  end;

  insert into private.fleet_audit_events (actor_id, channel, action, reason_code, intent_id)
    values (p_actor_id, p_channel, 'intent.submit', reason_code, intent_id);
  return next;
end;
$$;
revoke all on function private.fleet_submit_intent(uuid, text, private.fleet_intent_kind, jsonb, bytea, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_submit_intent(uuid, text, private.fleet_intent_kind, jsonb, bytea, jsonb, text)
  to service_role;

commit;
