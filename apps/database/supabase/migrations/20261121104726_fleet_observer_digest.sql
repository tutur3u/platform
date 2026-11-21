begin;

create table private.fleet_digest_display_values (
  project_key text not null references private.fleet_projects (key) on delete cascade,
  field text not null check (field in ('lane', 'releaseTitle', 'readinessItem')),
  value text not null check (
    char_length(value) between 1 and 120 and value = btrim(value)
    and value !~ '[[:cntrl:]]'
  ),
  primary key (project_key, field, value)
);

create table private.fleet_project_digests (
  project_key text primary key references private.fleet_projects (key) on delete cascade,
  generated_at timestamptz not null,
  received_at timestamptz not null default statement_timestamp(),
  lanes jsonb not null check (jsonb_typeof(lanes) = 'array')
);

alter table private.fleet_digest_display_values enable row level security;
alter table private.fleet_project_digests enable row level security;
revoke all on table private.fleet_digest_display_values, private.fleet_project_digests
  from public, anon, authenticated, service_role;

-- Only the Web service supplies an actor, from verified request identity.
create function private.fleet_get_access(p_actor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with control as (
    select coalesce(c.stopped, true) as stopped,
      coalesce(c.owner_user_id = p_actor_id and public.has_workspace_permission(
        '00000000-0000-0000-0000-000000000000'::uuid, p_actor_id, 'manage_mastermind'
      ), false) as is_owner
    from (values (true)) as singleton(id)
    left join private.fleet_control c on c.singleton = singleton.id
  ), live_access as (
    select 'owner'::private.fleet_tier as tier,
      array[
        'status.read', 'ask', 'intent.request', 'work.create', 'work.redirect',
        'priority.set', 'comment', 'approve.low', 'approve.deploy',
        'approve.production_change', 'lane.pause', 'approve.migration',
        'approve.billing', 'access.grant', 'access.revoke', 'fleet.stop', 'fleet.resume'
      ] as capabilities,
      array(select p.key from private.fleet_projects p order by p.key) as projects
    from control where is_owner and not stopped
    union all
    select g.tier, g.capabilities,
      array(select gp.project_key from private.fleet_access_grant_projects gp
        where gp.user_id = g.user_id order by gp.project_key)
    from private.fleet_access_grants g cross join control
    where g.auth_user_id = p_actor_id and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > statement_timestamp())
      and not is_owner and not stopped
  )
  select jsonb_build_object(
    'enabled', a.tier is not null,
    'tier', a.tier,
    'projects', coalesce(a.projects, '{}'::text[]),
    'capabilities', coalesce(a.capabilities, '{}'::text[]),
    'stopped', c.stopped
  )
  from control c left join live_access a on true;
$$;
revoke all on function private.fleet_get_access(uuid) from public, anon, authenticated, service_role;
grant execute on function private.fleet_get_access(uuid) to service_role;

-- The Web API validates the full document shape. The database controls which
-- human-readable values can appear and applies removals to existing snapshots.
-- tuturuuu: no-grant (internal)
create function private.fleet_digest_labels_approved(p_project_key text, p_lanes jsonb)
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select not exists (
    select 1
    from jsonb_array_elements(p_lanes) as lane(data)
    cross join lateral (values
      ('lane', lane.data ->> 'lane'),
      ('releaseTitle', lane.data ->> 'releaseTitle'),
      ('readinessItem', lane.data ->> 'readinessItem')
    ) as label(field, value)
    where (label.field = 'lane' or label.value is not null)
      and not exists (
        select 1 from private.fleet_digest_display_values a
        where a.project_key = p_project_key and a.field = label.field and a.value = label.value
      )
  );
$$;
revoke all on function private.fleet_digest_labels_approved(text, jsonb)
  from public, anon, authenticated, service_role;

create function private.fleet_get_digest(p_actor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select case when (access.data -> 'enabled') = 'true'::jsonb
    and (access.data -> 'capabilities') ? 'status.read'
    then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'projectKey', d.project_key,
          'generatedAt', to_char(d.generated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'receivedAt', to_char(d.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'stale', d.received_at <= statement_timestamp() - interval '1 hour',
          'lanes', d.lanes
        ) order by d.project_key
      )
      from jsonb_array_elements_text(access.data -> 'projects') as p(key)
      join private.fleet_project_digests d on d.project_key = p.key
      where private.fleet_digest_labels_approved(d.project_key, d.lanes)
    ), '[]'::jsonb)
    end
  from (select private.fleet_get_access(p_actor_id) as data) as access;
$$;
revoke all on function private.fleet_get_digest(uuid) from public, anon, authenticated, service_role;
grant execute on function private.fleet_get_digest(uuid) to service_role;

-- The service role calls this only after authenticating the digest publisher.
create function private.fleet_publish_digest(
  p_project_key text, p_generated_at timestamptz, p_lanes jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_stopped boolean;
begin
  select stopped into v_stopped from private.fleet_control for share;
  if v_stopped is distinct from false then
    return 'stopped';
  end if;

  perform 1 from private.fleet_projects where key = p_project_key for key share;
  if not found then
    return 'unknown_project';
  end if;

  if p_generated_at is null or not isfinite(p_generated_at)
    or p_generated_at > statement_timestamp() + interval '30 seconds'
    or jsonb_typeof(p_lanes) is distinct from 'array' then
    return 'invalid_digest';
  end if;
  if jsonb_array_length(p_lanes) > 100 or exists (
    select 1 from jsonb_array_elements(p_lanes) as lane(data)
    where case when jsonb_typeof(lane.data) = 'object' then
      lane.data - array['lane', 'state', 'eta', 'shortSha', 'releaseTitle', 'readinessItem', 'blockerCodes'] <> '{}'::jsonb
      or jsonb_typeof(lane.data -> 'lane') is distinct from 'string'
      or jsonb_typeof(lane.data -> 'blockerCodes') is distinct from 'array'
      or coalesce(lane.data ->> 'state', '') not in ('planned', 'running', 'blocked', 'ready', 'done', 'paused')
    else true end
  ) then
    return 'invalid_digest';
  end if;
  if not private.fleet_digest_labels_approved(p_project_key, p_lanes) then
    return 'unapproved_display_value';
  end if;

  -- Preserve the newest timestamp and accept exact retries of its payload.
  insert into private.fleet_project_digests as d (project_key, generated_at, lanes)
    values (p_project_key, p_generated_at, p_lanes)
    on conflict (project_key) do update
    set generated_at = excluded.generated_at, received_at = excluded.received_at, lanes = excluded.lanes
    where excluded.generated_at > d.generated_at;
  if found or exists (
    select 1 from private.fleet_project_digests d
    where d.project_key = p_project_key and d.generated_at = p_generated_at and d.lanes = p_lanes
  ) then
    return 'published';
  end if;
  return 'stale_snapshot';
end;
$$;
revoke all on function private.fleet_publish_digest(text, timestamptz, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_publish_digest(text, timestamptz, jsonb)
  to service_role;

commit;
