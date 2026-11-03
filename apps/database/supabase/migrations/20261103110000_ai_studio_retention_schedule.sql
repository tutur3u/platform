-- AI Studio retention schedule. The privacy policy promises that AI request
-- metadata is deleted after 365 days by default; private.cleanup_ai_studio_retention()
-- implements that but is unbounded and nothing schedules it. This adds, for
-- the Cron Control job `ai-studio-retention`:
--   * private.count_ai_studio_retention()            counts-only preview (read-only)
--   * private.cleanup_ai_studio_retention_batch(n)   at most n rows per table per call
--   * private.record_ai_studio_retention_run(...)    counts-only run log
-- The original function is left unchanged. All new functions are SECURITY
-- INVOKER with a pinned search_path and are executable by service_role only.
--
-- Exclusions (also in the batch and the preview):
--   * The Easy Center workspace (customer never-write rule).
--   * Runs still 'reserved' or 'running' (credit settlement in flight).
--   * Runs created in the current calendar month, so a short workspace policy
--     (minimum 30 days) cannot shrink the monthly credit-budget sum, which reads
--     private.ai_studio_usage from the start of the month.
-- The authoritative credit ledger (public.ai_credit_transactions,
-- public.workspace_ai_credit_balances, private.ai_credit_reservations) has no
-- foreign key to runs and is never touched.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

create table if not exists private.ai_studio_retention_runs (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default now(),
  mode text not null check (mode in ('dry_run', 'delete')),
  status text not null
    check (status in ('done', 'budget_exhausted', 'stopped', 'failed', 'unknown')),
  batches integer not null check (batches between 0 and 1000),
  content_rows bigint not null check (content_rows >= 0),
  run_rows bigint not null check (run_rows >= 0),
  cascade_content_rows bigint not null check (cascade_content_rows >= 0),
  step_rows bigint not null check (step_rows >= 0),
  usage_rows bigint not null check (usage_rows >= 0),
  evaluation_links bigint not null check (evaluation_links >= 0),
  held_in_flight_runs bigint check (held_in_flight_runs >= 0),
  held_current_month_runs bigint check (held_current_month_runs >= 0)
);

comment on table private.ai_studio_retention_runs is
  'One row per ai-studio-retention Cron Control run: mode, status and row counts only. Never content or identifiers.';

create index if not exists ai_studio_retention_runs_recorded_idx
  on private.ai_studio_retention_runs (recorded_at desc);

alter table private.ai_studio_retention_runs enable row level security;
revoke all on table private.ai_studio_retention_runs from public, anon, authenticated;
grant select, insert on table private.ai_studio_retention_runs to service_role;

-- Effective metadata cutoff for a retention window: never inside the current
-- calendar month (see the header).
create or replace function private.ai_studio_metadata_cutoff(
  p_retention_days integer,
  p_now timestamptz
)
returns timestamptz
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select least(
    p_now - make_interval(days => p_retention_days),
    date_trunc('month', p_now)
  );
$$;

create or replace function private.count_ai_studio_retention()
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := transaction_timestamp();
  v_global integer;
  v_result jsonb;
begin
  select g.metadata_retention_days into v_global
    from private.ai_studio_global_settings g
   where g.singleton;
  v_global := coalesce(v_global, 365);

  with windows as (
    select w.id as ws_id,
           coalesce(p.metadata_retention_days, v_global) as days,
           p.metadata_retention_days is not null as overridden
      from public.workspaces w
      left join private.workspace_ai_studio_policies p on p.ws_id = w.id
     -- Never select the Easy Center workspace (customer never-write rule).
     where w.id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
  ),
  cutoffs as (
    select ws_id, overridden,
           v_now - make_interval(days => days) as aged_before,
           private.ai_studio_metadata_cutoff(days, v_now) as cutoff
      from windows
  ),
  aged as (
    select r.id, r.created_at,
           r.status in ('reserved', 'running') as in_flight,
           r.created_at < c.cutoff as before_cutoff
      from cutoffs c
      join private.ai_studio_runs r
        on r.ws_id = c.ws_id and r.created_at < c.aged_before
  ),
  due as (
    select id, created_at from aged where before_cutoff and not in_flight
  ),
  expired_content as (
    select c.expires_at
      from private.ai_studio_run_content c
      join private.ai_studio_runs r on r.id = c.run_id
     where c.expires_at <= v_now
       and r.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
  )
  select jsonb_build_object(
    'content_rows', (select count(*) from expired_content),
    'content_oldest', (select min(expires_at) from expired_content),
    'content_newest', (select max(expires_at) from expired_content),
    'run_rows', (select count(*) from due),
    'run_oldest', (select min(created_at) from due),
    'run_newest', (select max(created_at) from due),
    'cascade_content_rows', (select count(*) from private.ai_studio_run_content c
      where c.run_id in (select id from due) and c.expires_at > v_now),
    'step_rows', (select count(*) from private.ai_studio_run_steps s
      where s.run_id in (select id from due)),
    'usage_rows', (select count(*) from private.ai_studio_usage u
      where u.run_id in (select id from due)),
    'evaluation_links', (select count(*) from private.ai_studio_evaluation_results e
      where e.run_id in (select id from due)),
    'held_in_flight_runs', (select count(*) from aged where in_flight),
    'held_current_month_runs', (select count(*) from aged
      where not in_flight and not before_cutoff),
    'global_retention_days', v_global,
    'workspace_overrides', (select count(*) from cutoffs where overridden),
    'cutoff_oldest', (select min(cutoff) from cutoffs),
    'cutoff_newest', (select max(cutoff) from cutoffs)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function private.cleanup_ai_studio_retention_batch(
  p_limit integer default 500
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
set lock_timeout = '2s'
as $$
declare
  v_now timestamptz := transaction_timestamp();
  v_global integer;
  v_run_ids uuid[];
  v_content bigint := 0;
  v_runs bigint := 0;
  v_cascade bigint := 0;
  v_steps bigint := 0;
  v_usage bigint := 0;
  v_links bigint := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'p_limit must be between 1 and 1000' using errcode = '22023';
  end if;

  -- 1. Expired content (prompts, outputs, tool payloads), oldest expiry first.
  with doomed as (
    select c.run_id
      from private.ai_studio_run_content c
      join private.ai_studio_runs r on r.id = c.run_id
     where c.expires_at <= v_now
       -- Never purge the Easy Center workspace (customer never-write rule).
       and r.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
     order by c.expires_at, c.run_id
     limit p_limit
     for update of c skip locked
  )
  delete from private.ai_studio_run_content c
   using doomed d
   where c.run_id = d.run_id;
  get diagnostics v_content = row_count;

  -- 2. Run metadata past its workspace's window, oldest first, one index
  -- probe per workspace on ai_studio_runs_ws_created_idx.
  select g.metadata_retention_days into v_global
    from private.ai_studio_global_settings g
   where g.singleton;
  v_global := coalesce(v_global, 365);

  select coalesce(array_agg(locked.id), '{}'::uuid[]) into v_run_ids
    from (
      select r.id
        from private.ai_studio_runs r
       where r.id in (
               select due.id
                 from public.workspaces w
                 left join private.workspace_ai_studio_policies p
                   on p.ws_id = w.id
                cross join lateral (
                  select run.id, run.created_at
                    from private.ai_studio_runs run
                   where run.ws_id = w.id
                     and run.created_at < private.ai_studio_metadata_cutoff(
                           coalesce(p.metadata_retention_days, v_global), v_now)
                     and run.status not in ('reserved', 'running')
                   order by run.created_at, run.id
                   limit p_limit
                ) due
                where w.id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
                order by due.created_at, due.id
                limit p_limit
             )
         and r.status not in ('reserved', 'running')
       for update skip locked
    ) locked;

  if cardinality(v_run_ids) > 0 then
    select count(*) into v_cascade from private.ai_studio_run_content
     where run_id = any(v_run_ids);
    select count(*) into v_steps from private.ai_studio_run_steps
     where run_id = any(v_run_ids);
    select count(*) into v_usage from private.ai_studio_usage
     where run_id = any(v_run_ids);
    select count(*) into v_links from private.ai_studio_evaluation_results
     where run_id = any(v_run_ids);

    -- Steps, content and usage cascade; evaluation results keep their row
    -- with run_id set to null.
    delete from private.ai_studio_runs where id = any(v_run_ids);
    get diagnostics v_runs = row_count;
  end if;

  return jsonb_build_object(
    'state', case when v_content >= p_limit or v_runs >= p_limit
      then 'more' else 'done' end,
    'content_rows', v_content,
    'run_rows', v_runs,
    'cascade_content_rows', v_cascade,
    'step_rows', v_steps,
    'usage_rows', v_usage,
    'evaluation_links', v_links
  );
end;
$$;

create or replace function private.record_ai_studio_retention_run(
  p_mode text,
  p_status text,
  p_batches integer,
  p_content_rows bigint,
  p_run_rows bigint,
  p_cascade_content_rows bigint,
  p_step_rows bigint,
  p_usage_rows bigint,
  p_evaluation_links bigint,
  p_held_in_flight_runs bigint default null,
  p_held_current_month_runs bigint default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $$
  insert into private.ai_studio_retention_runs (
    mode, status, batches, content_rows, run_rows, cascade_content_rows,
    step_rows, usage_rows, evaluation_links, held_in_flight_runs,
    held_current_month_runs
  ) values (
    p_mode, p_status, p_batches, p_content_rows, p_run_rows,
    p_cascade_content_rows, p_step_rows, p_usage_rows, p_evaluation_links,
    p_held_in_flight_runs, p_held_current_month_runs
  );
  select jsonb_build_object('recorded', 1);
$$;

revoke all on function private.ai_studio_metadata_cutoff(integer, timestamptz)
  from public, anon, authenticated;
revoke all on function private.count_ai_studio_retention()
  from public, anon, authenticated;
revoke all on function private.cleanup_ai_studio_retention_batch(integer)
  from public, anon, authenticated;
revoke all on function private.record_ai_studio_retention_run(
  text, text, integer, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint
) from public, anon, authenticated;

grant execute on function private.ai_studio_metadata_cutoff(integer, timestamptz)
  to service_role;
grant execute on function private.count_ai_studio_retention() to service_role;
grant execute on function private.cleanup_ai_studio_retention_batch(integer)
  to service_role;
grant execute on function private.record_ai_studio_retention_run(
  text, text, integer, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint
) to service_role;

COMMIT;
