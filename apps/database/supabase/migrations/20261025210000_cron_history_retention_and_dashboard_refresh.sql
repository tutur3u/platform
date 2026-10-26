-- NEEDS MASTERMIND APPROVAL. Scheduling stays in Cloudflare Cron Control.
-- Repair the retained pure-SQL job without replacing its identity or cadence.
do $$
declare
  dashboard_job_id bigint;
begin
  select jobid into strict dashboard_job_id
  from cron.job where jobname = 'refresh-posts-dashboard';
  perform cron.alter_job(
    dashboard_job_id,
    command := 'SELECT private.refresh_posts_dashboard_view();'
  );
end;
$$;

create index if not exists workspace_cron_executions_retention_idx
  on public.workspace_cron_executions (end_time, id);

create or replace function private.prune_cron_history(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set statement_timeout = '10s'
set lock_timeout = '1s'
as $$
declare
  cutoff timestamptz := transaction_timestamp() - interval '7 days';
  pg_cron_deleted integer;
  managed_deleted integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'p_limit must be between 1 and 1000' using errcode = '22023';
  end if;

  with expired as (
    select runid from cron.job_run_details
    where end_time < cutoff and status in ('succeeded', 'failed')
    order by runid
    limit p_limit
    for update skip locked
  )
  delete from cron.job_run_details d using expired e where d.runid = e.runid;
  get diagnostics pg_cron_deleted = row_count;

  with expired as (
    select id from public.workspace_cron_executions
    where end_time < cutoff
    order by end_time, id
    limit p_limit
    for update skip locked
  )
  delete from public.workspace_cron_executions d using expired e where d.id = e.id;
  get diagnostics managed_deleted = row_count;

  return jsonb_build_object(
    'pg_cron_deleted', pg_cron_deleted,
    'managed_deleted', managed_deleted
  );
end;
$$;
revoke all on function private.prune_cron_history(integer) from public, anon, authenticated;
grant execute on function private.prune_cron_history(integer) to service_role;
