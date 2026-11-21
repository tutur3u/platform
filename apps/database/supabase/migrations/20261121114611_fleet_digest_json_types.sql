begin;

create or replace function private.fleet_publish_digest(
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
      or jsonb_typeof(lane.data -> 'state') is distinct from 'string'
      or (lane.data ? 'eta' and jsonb_typeof(lane.data -> 'eta') is distinct from 'string')
      or (lane.data ? 'shortSha' and jsonb_typeof(lane.data -> 'shortSha') is distinct from 'string')
      or (lane.data ? 'releaseTitle' and jsonb_typeof(lane.data -> 'releaseTitle') is distinct from 'string')
      or (lane.data ? 'readinessItem' and jsonb_typeof(lane.data -> 'readinessItem') is distinct from 'string')
      or case when jsonb_typeof(lane.data -> 'blockerCodes') = 'array' then exists (
        select 1 from jsonb_array_elements(lane.data -> 'blockerCodes') as blocker(code)
        where jsonb_typeof(blocker.code) is distinct from 'string'
      ) else true end
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
