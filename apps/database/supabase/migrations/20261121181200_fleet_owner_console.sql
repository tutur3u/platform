-- Owner management for the Mastermind Fleet access console. Web calls these
-- with the service role and the actor from a verified Mastermind session that
-- carries a fresh MFA proof. The database-owner functions in
-- 20261121095112_fleet_access_procedures.sql stay the fallback path.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Each Owner change records what changed beside its reason code.
alter table private.fleet_audit_events add column owner_change jsonb
  check (owner_change is null or jsonb_typeof(owner_change) = 'object');

-- The actor must be the configured Owner with the explicit root
-- manage_mastermind grant that fleet_require_owner locks. That grant implies
-- the owner branch of fleet_get_access. Locking the control row serializes
-- Owner changes with intent admission and with each other.
-- tuturuuu: no-grant (internal)
create function private.fleet_owner_actor(p_actor_id uuid)
returns uuid
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_owner uuid;
  v_root constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if auth.role() is distinct from 'service_role' or p_actor_id is null then
    raise exception 'Trusted Fleet Owner request required' using errcode = '42501';
  end if;

  select owner_user_id into v_owner from private.fleet_control where singleton for update;
  if v_owner is null or v_owner is distinct from p_actor_id then
    raise exception 'Fleet Owner access required' using errcode = '42501';
  end if;

  perform 1
  from auth.users u
  join public.workspace_members m on m.user_id = u.id and m.ws_id = v_root and m.type = 'MEMBER'
  join public.workspace_role_members rm on rm.user_id = u.id
  join private.mastermind_access_role mr on mr.role_id = rm.role_id
  join public.workspace_roles r on r.id = mr.role_id and r.ws_id = v_root
  join public.workspace_role_permissions rp on rp.role_id = r.id and rp.ws_id = v_root
  where u.id = p_actor_id and rp.permission = 'manage_mastermind' and rp.enabled
  for share of u, m, rm, mr, r, rp;

  if not found then
    raise exception 'Fleet Owner access required' using errcode = '42501';
  end if;
  return p_actor_id;
end;
$$;
revoke all on function private.fleet_owner_actor(uuid)
  from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
create function private.fleet_owner_instant(p_value timestamptz)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select to_char(p_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;
revoke all on function private.fleet_owner_instant(timestamptz)
  from public, anon, authenticated, service_role;

-- The console's whole read: stop state, every grant and the catalog with its
-- approved display values.
create function private.fleet_owner_list_access(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_control private.fleet_control%rowtype;
begin
  perform private.fleet_owner_actor(p_actor_id);
  select * into v_control from private.fleet_control where singleton;

  return jsonb_build_object(
    'stopped', v_control.stopped,
    'generation', v_control.generation::text,
    'grants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', g.user_id,
        'email', u.email,
        'tier', g.tier,
        'capabilities', to_jsonb(g.capabilities),
        'projects', to_jsonb(array(
          select gp.project_key from private.fleet_access_grant_projects gp
          where gp.user_id = g.user_id order by gp.project_key
        )),
        'expiresAt', private.fleet_owner_instant(g.expires_at),
        'revokedAt', private.fleet_owner_instant(g.revoked_at),
        'status', case
          when g.revoked_at is not null or g.auth_user_id is null then 'revoked'
          when g.expires_at <= statement_timestamp() then 'expired'
          else 'active'
        end,
        'generation', g.generation::text,
        'questionsPerHour', g.questions_per_hour,
        'intentsPerDay', g.intents_per_day,
        'modelBudgetPerMonth', g.model_budget_per_month
      ) order by g.revoked_at is not null, u.email, g.user_id)
      from private.fleet_access_grants g
      left join auth.users u on u.id = g.auth_user_id
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', p.key,
        'nameEn', p.name_en,
        'nameVi', p.name_vi,
        'displayValues', jsonb_build_object(
          'lane', to_jsonb(array(select v.value from private.fleet_digest_display_values v
            where v.project_key = p.key and v.field = 'lane' order by v.value)),
          'releaseTitle', to_jsonb(array(select v.value from private.fleet_digest_display_values v
            where v.project_key = p.key and v.field = 'releaseTitle' order by v.value)),
          'readinessItem', to_jsonb(array(select v.value from private.fleet_digest_display_values v
            where v.project_key = p.key and v.field = 'readinessItem' order by v.value))
        )
      ) order by p.key)
      from private.fleet_projects p
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function private.fleet_owner_list_access(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_owner_list_access(uuid) to service_role;

-- Grants or replaces one person's grant, found by account email. A new grant
-- passes no generation and cannot replace a live grant; an edit passes the
-- generation it read. The grant trigger enforces the tier ceiling, refuses
-- the Owner tier and advances the generation.
create function private.fleet_owner_grant_access(
  p_actor_id uuid,
  p_email text,
  p_tier private.fleet_tier,
  p_capabilities text[],
  p_project_keys text[],
  p_expires_at timestamptz,
  p_questions_per_hour integer,
  p_intents_per_day integer,
  p_model_budget_per_month bigint,
  p_expected_generation bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := private.fleet_owner_actor(p_actor_id);
  v_users uuid[];
  v_user uuid;
  v_grant private.fleet_access_grants%rowtype;
  v_generation bigint;
  v_result text := 'granted';
begin
  v_users := array(
    select u.id from auth.users u
    where lower(u.email) = lower(btrim(coalesce(p_email, ''))) and u.deleted_at is null
    order by u.id limit 2
  );
  if cardinality(v_users) <> 1 then
    v_result := 'unknown_user';
  else
    v_user := v_users[1];
    select * into v_grant from private.fleet_access_grants where user_id = v_user for update;
    if p_expected_generation is not null
      and v_grant.generation is distinct from p_expected_generation then
      v_result := 'generation_changed';
    elsif p_expected_generation is null and v_grant.user_id is not null
      and v_grant.revoked_at is null and v_grant.auth_user_id is not null
      and (v_grant.expires_at is null or v_grant.expires_at > clock_timestamp()) then
      v_result := 'grant_exists';
    elsif coalesce(array_ndims(p_project_keys), 0) <> 1
      or array_position(p_project_keys, null) is not null
      or cardinality(p_project_keys) <> (select count(distinct key) from unnest(p_project_keys) as key)
      or (p_expires_at is not null and p_expires_at <= clock_timestamp())
      or p_questions_per_hour is null or p_intents_per_day is null
      or p_model_budget_per_month is null then
      v_result := 'invalid_grant';
    else
      begin
        insert into private.fleet_access_grants as g (
          user_id, tier, capabilities, expires_at, questions_per_hour, intents_per_day,
          model_budget_per_month
        ) values (
          v_user, p_tier, p_capabilities, p_expires_at, p_questions_per_hour, p_intents_per_day,
          p_model_budget_per_month
        )
        on conflict (user_id) do update
        set auth_user_id = excluded.auth_user_id, tier = excluded.tier,
            capabilities = excluded.capabilities, expires_at = excluded.expires_at,
            questions_per_hour = excluded.questions_per_hour,
            intents_per_day = excluded.intents_per_day,
            model_budget_per_month = excluded.model_budget_per_month, revoked_at = null,
            generation = g.generation + 1
        returning generation into v_generation;

        delete from private.fleet_access_grant_projects where user_id = v_user;
        insert into private.fleet_access_grant_projects (user_id, project_key)
          select v_user, key from unnest(p_project_keys) as key;
        if v_grant.user_id is not null then
          v_result := 'updated';
        end if;
      exception
        when check_violation or not_null_violation or invalid_text_representation then
          v_result := 'invalid_grant';
          v_generation := null;
        when foreign_key_violation then
          v_result := 'unknown_project';
          v_generation := null;
      end;
    end if;
  end if;

  insert into private.fleet_audit_events (
    actor_id, channel, action, reason_code, subject_user_id, owner_change
  ) values (
    v_actor, 'web', 'access.grant', v_result, v_user,
    case when v_generation is not null then jsonb_build_object(
      'tier', p_tier, 'capabilities', to_jsonb(p_capabilities),
      'projects', to_jsonb(p_project_keys),
      'expiresAt', private.fleet_owner_instant(p_expires_at),
      'questionsPerHour', p_questions_per_hour, 'intentsPerDay', p_intents_per_day,
      'modelBudgetPerMonth', p_model_budget_per_month, 'generation', v_generation::text
    ) end
  );
  return jsonb_build_object('result', v_result, 'userId', v_user, 'generation', v_generation::text);
end;
$$;
revoke all on function private.fleet_owner_grant_access(
  uuid, text, private.fleet_tier, text[], text[], timestamptz, integer, integer, bigint, bigint
) from public, anon, authenticated, service_role;
grant execute on function private.fleet_owner_grant_access(
  uuid, text, private.fleet_tier, text[], text[], timestamptz, integer, integer, bigint, bigint
) to service_role;

-- Revocation applies to the generation the Owner read.
create function private.fleet_owner_revoke_access(
  p_actor_id uuid, p_user_id uuid, p_expected_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := private.fleet_owner_actor(p_actor_id);
  v_grant private.fleet_access_grants%rowtype;
  v_generation bigint;
  v_result text;
begin
  select * into v_grant from private.fleet_access_grants where user_id = p_user_id for update;
  if not found then
    v_result := 'not_found';
  elsif v_grant.generation is distinct from p_expected_generation then
    v_result := 'generation_changed';
  elsif v_grant.revoked_at is not null then
    v_result := 'already_revoked';
  else
    update private.fleet_access_grants set revoked_at = clock_timestamp()
    where user_id = p_user_id
    returning generation into v_generation;
    v_result := 'revoked';
  end if;

  insert into private.fleet_audit_events (
    actor_id, channel, action, reason_code, subject_user_id, owner_change
  ) values (
    v_actor, 'web', 'access.revoke', v_result, p_user_id,
    case when v_generation is not null then
      jsonb_build_object('generation', v_generation::text) end
  );
  return jsonb_build_object('result', v_result, 'generation', v_generation::text);
end;
$$;
revoke all on function private.fleet_owner_revoke_access(uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_owner_revoke_access(uuid, uuid, bigint) to service_role;

-- Stop and resume apply to the control generation the Owner read.
create function private.fleet_owner_set_stopped(
  p_actor_id uuid, p_stopped boolean, p_expected_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := private.fleet_owner_actor(p_actor_id);
  v_control private.fleet_control%rowtype;
  v_result text;
begin
  select * into v_control from private.fleet_control where singleton;
  if p_stopped is null then
    v_result := 'invalid_request';
  elsif v_control.generation is distinct from p_expected_generation then
    v_result := 'generation_changed';
  elsif v_control.stopped = p_stopped then
    v_result := 'unchanged';
  else
    update private.fleet_control set stopped = p_stopped where singleton
    returning * into v_control;
    v_result := case when p_stopped then 'stopped' else 'resumed' end;
  end if;

  insert into private.fleet_audit_events (actor_id, channel, action, reason_code, owner_change)
  values (
    v_actor, 'web', case when p_stopped then 'fleet.stop' else 'fleet.resume' end, v_result,
    jsonb_build_object('stopped', v_control.stopped, 'generation', v_control.generation::text)
  );
  return jsonb_build_object(
    'result', v_result, 'stopped', v_control.stopped, 'generation', v_control.generation::text
  );
end;
$$;
revoke all on function private.fleet_owner_set_stopped(uuid, boolean, bigint)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_owner_set_stopped(uuid, boolean, bigint) to service_role;

-- Creates a catalog project or renames one. Names never change the target
-- mapping version, so open intents keep their binding.
create function private.fleet_owner_upsert_project(
  p_actor_id uuid, p_key text, p_name_en text, p_name_vi text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := private.fleet_owner_actor(p_actor_id);
  v_name_en text := btrim(coalesce(p_name_en, ''));
  v_name_vi text := btrim(coalesce(p_name_vi, ''));
  v_inserted boolean;
  v_result text;
begin
  if char_length(v_name_en) not between 1 and 80 or char_length(v_name_vi) not between 1 and 80
    or v_name_en ~ '[[:cntrl:]]' or v_name_vi ~ '[[:cntrl:]]' then
    v_result := 'invalid_project';
  else
    begin
      insert into private.fleet_projects as p (key, name_en, name_vi)
        values (p_key, v_name_en, v_name_vi)
        on conflict (key) do update set name_en = excluded.name_en, name_vi = excluded.name_vi
        returning xmax = 0 into v_inserted;
      v_result := case when v_inserted then 'created' else 'updated' end;
    exception
      when check_violation or not_null_violation then
        v_result := 'invalid_project';
    end;
  end if;

  insert into private.fleet_audit_events (actor_id, channel, action, reason_code, owner_change)
  values (
    v_actor, 'web', 'catalog.upsert', v_result,
    case when v_result in ('created', 'updated') then
      jsonb_build_object('projectKey', p_key, 'nameEn', v_name_en, 'nameVi', v_name_vi) end
  );
  return jsonb_build_object('result', v_result);
end;
$$;
revoke all on function private.fleet_owner_upsert_project(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_owner_upsert_project(uuid, text, text, text) to service_role;

-- Approves or removes one display value for a project field. Removing an
-- approval hides any stored snapshot that still shows the value.
create function private.fleet_owner_set_display_value(
  p_actor_id uuid, p_project_key text, p_field text, p_value text, p_approved boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := private.fleet_owner_actor(p_actor_id);
  v_result text;
begin
  perform 1 from private.fleet_projects where key = p_project_key for key share;
  if not found then
    v_result := 'unknown_project';
  elsif p_approved is null then
    v_result := 'invalid_request';
  elsif not p_approved then
    delete from private.fleet_digest_display_values
    where project_key = p_project_key and field = p_field and value = p_value;
    v_result := case when found then 'removed' else 'unchanged' end;
  elsif exists (
    select 1 from private.fleet_digest_display_values
    where project_key = p_project_key and field = p_field and value = p_value
  ) then
    v_result := 'unchanged';
  elsif (select count(*) from private.fleet_digest_display_values
    where project_key = p_project_key and field = p_field) >= 200 then
    v_result := 'too_many_values';
  else
    begin
      insert into private.fleet_digest_display_values (project_key, field, value)
        values (p_project_key, p_field, p_value);
      v_result := 'approved';
    exception
      when check_violation or not_null_violation then
        v_result := 'invalid_value';
    end;
  end if;

  insert into private.fleet_audit_events (actor_id, channel, action, reason_code, owner_change)
  values (
    v_actor, 'web', 'display.set', v_result,
    case when v_result in ('approved', 'removed') then
      jsonb_build_object('projectKey', p_project_key, 'field', p_field, 'value', p_value) end
  );
  return jsonb_build_object('result', v_result);
end;
$$;
revoke all on function private.fleet_owner_set_display_value(uuid, text, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_owner_set_display_value(uuid, text, text, text, boolean)
  to service_role;

commit;
