-- Daily provider billing lines collected from read-only provider APIs.
-- A collected day is replaced as a whole, because providers restate recent
-- days while late usage settles. Invoices remain the posted-cost control in
-- private.external_provider_invoices; these lines are usage evidence.
create table private.provider_cost_lines (
  provider text not null check (provider in ('github', 'vercel', 'cloudflare')),
  account_id text not null check (account_id ~ '^[a-zA-Z0-9_.-]{1,128}$'),
  usage_date date not null,
  line_key text not null check (line_key ~ '^[0-9a-f]{64}$'),
  service text not null check (length(service) between 1 and 160),
  sku text not null default '' check (length(sku) <= 160),
  app_id text not null default '' check (length(app_id) <= 128),
  environment text not null default 'shared'
    check (environment in ('production', 'staging', 'preview', 'ci', 'shared')),
  quantity numeric(30,9) not null default 0,
  unit text not null default '' check (length(unit) <= 64),
  -- Null when the provider reports no list price for the line.
  list_amount_usd numeric(24,12)
    check (list_amount_usd > -1000000000 and list_amount_usd < 1000000000),
  billed_amount_usd numeric(24,12) not null
    check (billed_amount_usd > -1000000000 and billed_amount_usd < 1000000000),
  collected_at timestamptz not null,
  primary key (provider, account_id, usage_date, line_key)
);
create index provider_cost_lines_date_idx
  on private.provider_cost_lines (usage_date desc, provider);

-- One row per provider-day the collector has claimed. A claim counts an
-- attempt before the provider is called; a complete collection resets it.
-- budget_exhausted is terminal: the day exceeded its response budget or its
-- attempt budget and is not planned or written again until an operator
-- deletes this row.
create table private.provider_cost_collection_days (
  provider text not null check (provider in ('github', 'vercel', 'cloudflare')),
  account_id text not null check (account_id ~ '^[a-zA-Z0-9_.-]{1,128}$'),
  usage_date date not null,
  status text not null check (status in ('pending', 'complete', 'budget_exhausted')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  line_count integer not null default 0 check (line_count between 0 and 2000),
  collected_at timestamptz,
  attempted_at timestamptz not null,
  primary key (provider, account_id, usage_date)
);

alter table private.provider_cost_lines enable row level security;
alter table private.provider_cost_collection_days enable row level security;
revoke all on private.provider_cost_lines, private.provider_cost_collection_days
  from public, anon, authenticated, service_role;

-- Every writer of a provider-day takes this transaction lock first, so
-- claims, markers and recordings for the same day are serialized.
-- tuturuuu: no-grant (internal)
create function private.lock_provider_cost_day(
  p_provider text, p_account_id text, p_usage_date date
) returns void
language sql security definer set search_path = pg_catalog, pg_temp as $$
  select pg_advisory_xact_lock(hashtextextended(
    format('provider_cost:%s:%s:%s', p_provider, p_account_id, p_usage_date), 0));
$$;

-- Counts one attempt for a provider-day before its provider call. Returns
-- false, and marks the day exhausted, once three attempts have not produced
-- a complete collection; returns false for an exhausted day.
create function private.claim_provider_cost_day(
  p_provider text, p_account_id text, p_usage_date date
) returns boolean
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  day_row private.provider_cost_collection_days;
begin
  perform private.lock_provider_cost_day(p_provider, p_account_id, p_usage_date);
  select * into day_row from private.provider_cost_collection_days d
    where d.provider = p_provider and d.account_id = p_account_id and d.usage_date = p_usage_date;
  if found and day_row.status = 'budget_exhausted' then
    return false;
  end if;
  if found and day_row.attempts >= 3 then
    update private.provider_cost_collection_days d set status = 'budget_exhausted'
      where d.provider = p_provider and d.account_id = p_account_id and d.usage_date = p_usage_date;
    return false;
  end if;
  insert into private.provider_cost_collection_days as d
    (provider, account_id, usage_date, status, attempts, attempted_at)
  values (p_provider, p_account_id, p_usage_date, 'pending', 1, now())
  on conflict (provider, account_id, usage_date) do update
    set attempts = d.attempts + 1, attempted_at = now();
  return true;
end $$;

-- Replaces one provider-day. A snapshot no newer than the stored collection
-- and any write to an exhausted day are ignored.
create function private.record_provider_cost_day(
  p_provider text, p_account_id text, p_usage_date date,
  p_collected_at timestamptz, p_lines jsonb
) returns integer
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  day_row private.provider_cost_collection_days;
  line_count integer;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'p_lines must be an array' using errcode = '22023';
  end if;
  line_count := jsonb_array_length(p_lines);
  if line_count > 2000 then
    raise exception 'Too many cost lines for one day' using errcode = '22023';
  end if;
  if p_collected_at > now() + interval '5 minutes' then
    raise exception 'Collection time is in the future' using errcode = '22023';
  end if;

  perform private.lock_provider_cost_day(p_provider, p_account_id, p_usage_date);
  select * into day_row from private.provider_cost_collection_days d
    where d.provider = p_provider and d.account_id = p_account_id and d.usage_date = p_usage_date;
  if found and (day_row.status = 'budget_exhausted'
      or day_row.collected_at >= p_collected_at) then
    return 0;
  end if;

  delete from private.provider_cost_lines l
    where l.provider = p_provider and l.account_id = p_account_id and l.usage_date = p_usage_date;
  insert into private.provider_cost_lines (
    provider, account_id, usage_date, line_key, service, sku, app_id, environment,
    quantity, unit, list_amount_usd, billed_amount_usd, collected_at
  )
  select p_provider, p_account_id, p_usage_date,
    encode(sha256(convert_to(concat_ws(chr(31), line.service, line.sku, line.app_id, line.environment, line.unit), 'UTF8')), 'hex'),
    line.service, line.sku, line.app_id, line.environment,
    sum(line.quantity), line.unit, sum(line.list_amount_usd), sum(line.billed_amount_usd), p_collected_at
  from (
    select raw.service, coalesce(raw.sku, '') as sku, coalesce(raw.app_id, '') as app_id,
      coalesce(raw.environment, 'shared') as environment, coalesce(raw.quantity, 0) as quantity,
      coalesce(raw.unit, '') as unit, raw.list_amount_usd, raw.billed_amount_usd
    from jsonb_to_recordset(p_lines) as raw(
      service text, sku text, app_id text, environment text, quantity numeric,
      unit text, list_amount_usd numeric, billed_amount_usd numeric
    )
  ) line
  group by line.service, line.sku, line.app_id, line.environment, line.unit;

  insert into private.provider_cost_collection_days as d
    (provider, account_id, usage_date, status, attempts, line_count, collected_at, attempted_at)
  values (p_provider, p_account_id, p_usage_date, 'complete', 0, line_count, p_collected_at, now())
  on conflict (provider, account_id, usage_date) do update
    set status = 'complete', attempts = 0, line_count = excluded.line_count,
      collected_at = excluded.collected_at;
  return line_count;
end $$;

-- Marks a provider-day whose response exceeded the collector budget. Lines
-- and the collection time of an earlier complete collection stay in place.
create function private.mark_provider_cost_day_exhausted(
  p_provider text, p_account_id text, p_usage_date date
) returns boolean
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform private.lock_provider_cost_day(p_provider, p_account_id, p_usage_date);
  insert into private.provider_cost_collection_days as d
    (provider, account_id, usage_date, status, attempted_at)
  values (p_provider, p_account_id, p_usage_date, 'budget_exhausted', now())
  on conflict (provider, account_id, usage_date) do update
    set status = 'budget_exhausted';
  return true;
end $$;

-- Days to collect this run: up to seven requested recent days, newest first,
-- then up to p_backfill_limit days in [p_from, p_to] with no complete
-- collection, oldest first, plus claimed days up to seven days before
-- p_from. Exhausted days are never returned.
create function private.plan_provider_cost_days(
  p_provider text, p_account_id text, p_recent date[], p_from date, p_to date,
  p_backfill_limit integer
) returns setof date
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  with requested as (
    select distinct day from unnest(coalesce(p_recent[1:7], '{}'::date[])) as day
    where day is not null
  ), recent as (
    select r.day from requested r
    where not exists (
      select 1 from private.provider_cost_collection_days d
      where d.provider = p_provider and d.account_id = p_account_id
        and d.usage_date = r.day and d.status = 'budget_exhausted'
    )
  ), backfill as (
    -- A day already claimed stays eligible for seven days past p_from, so a
    -- day at the edge of the window keeps its remaining attempts.
    select series.day::date as day
    from generate_series(p_from - 7, least(p_to, p_from + 400), interval '1 day') as series(day)
    where not exists (
      select 1 from private.provider_cost_collection_days d
      where d.provider = p_provider and d.account_id = p_account_id
        and d.usage_date = series.day::date and d.status <> 'pending'
    ) and (series.day >= p_from or exists (
      select 1 from private.provider_cost_collection_days d
      where d.provider = p_provider and d.account_id = p_account_id
        and d.usage_date = series.day::date and d.status = 'pending'
    )) and not exists (select 1 from requested r where r.day = series.day::date)
    order by series.day
    limit least(greatest(coalesce(p_backfill_limit, 0), 0), 24)
  )
  select day from (
    select day, 0 as rank from recent
    union all select day, 1 from backfill
  ) planned
  order by rank, case when rank = 0 then day end desc, case when rank = 1 then day end;
$$;

create function private.get_provider_cost_daily(p_from date, p_to date)
returns table (
  usage_date date, provider text, account_id text, service text, app_id text,
  environment text, list_amount_usd numeric, billed_amount_usd numeric,
  collected_at timestamptz
)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select l.usage_date, l.provider, l.account_id, l.service, l.app_id, l.environment,
    sum(l.list_amount_usd), sum(l.billed_amount_usd), max(l.collected_at)
  from private.provider_cost_lines l
  where l.usage_date >= p_from and l.usage_date < p_to and p_to <= p_from + 400
  group by 1, 2, 3, 4, 5, 6
  order by 1, 2, 3, 4, 5, 6;
$$;

create function private.get_provider_cost_collection_status()
returns table (
  provider text, account_id text, first_day date, last_day date, days bigint,
  exhausted_days bigint, last_collected_at timestamptz
)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select d.provider, d.account_id,
    min(d.usage_date) filter (where d.status = 'complete'),
    max(d.usage_date) filter (where d.status = 'complete'),
    count(*) filter (where d.status = 'complete'),
    count(*) filter (where d.status = 'budget_exhausted'),
    max(d.collected_at)
  from private.provider_cost_collection_days d
  group by 1, 2 order by 1, 2;
$$;

revoke all on function private.lock_provider_cost_day(text,text,date) from public, anon, authenticated, service_role;
revoke all on function private.claim_provider_cost_day(text,text,date) from public, anon, authenticated;
revoke all on function private.record_provider_cost_day(text,text,date,timestamptz,jsonb) from public, anon, authenticated;
revoke all on function private.mark_provider_cost_day_exhausted(text,text,date) from public, anon, authenticated;
revoke all on function private.plan_provider_cost_days(text,text,date[],date,date,integer) from public, anon, authenticated;
revoke all on function private.get_provider_cost_daily(date,date) from public, anon, authenticated;
revoke all on function private.get_provider_cost_collection_status() from public, anon, authenticated;
grant execute on function private.claim_provider_cost_day(text,text,date) to service_role;
grant execute on function private.record_provider_cost_day(text,text,date,timestamptz,jsonb) to service_role;
grant execute on function private.mark_provider_cost_day_exhausted(text,text,date) to service_role;
grant execute on function private.plan_provider_cost_days(text,text,date[],date,date,integer) to service_role;
grant execute on function private.get_provider_cost_daily(date,date) to service_role;
grant execute on function private.get_provider_cost_collection_status() to service_role;
