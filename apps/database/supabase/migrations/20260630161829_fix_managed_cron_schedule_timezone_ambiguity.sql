create or replace function private.external_app_managed_cron_update_job(
  p_ws_id uuid,
  p_external_app_id text,
  p_external_job_key text,
  p_enabled boolean default null,
  p_schedule text default null,
  p_schedule_timezone text default null,
  p_next_run_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_updated boolean := false;
begin
  update public.workspace_cron_jobs as j
  set
    active = coalesce(p_enabled, j.active),
    schedule = coalesce(nullif(p_schedule, ''), j.schedule),
    schedule_timezone = coalesce(nullif(p_schedule_timezone, ''), j.schedule_timezone, 'UTC'),
    next_run_at = case
      when p_next_run_at is not null then p_next_run_at
      when coalesce(p_enabled, j.active) = true and j.next_run_at is null then now()
      else j.next_run_at
    end
  where j.ws_id = p_ws_id
    and j.external_app_id = p_external_app_id
    and j.external_job_key = p_external_job_key
  returning true
  into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke all on function private.external_app_managed_cron_update_job(uuid, text, text, boolean, text, text, timestamptz) from public, anon, authenticated;
grant execute on function private.external_app_managed_cron_update_job(uuid, text, text, boolean, text, text, timestamptz) to service_role;
