-- Root-workspace operator alerts and provider cost budgets.
--
-- private.send_root_operator_alert is the shared server-side sender for
-- platform operator alerts. It delivers through public.create_notification,
-- so each recipient's web, email and push preferences apply, and sends each
-- dedupe key at most once.

create table private.root_operator_alerts (
  dedupe_key text primary key check (dedupe_key ~ '^[a-z0-9:._-]{1,200}$'),
  kind text not null check (kind ~ '^[a-z0-9_.-]{1,64}$'),
  recipients integer not null check (recipients between 0 and 50),
  sent_at timestamptz not null default now()
);
alter table private.root_operator_alerts enable row level security;
revoke all on private.root_operator_alerts from public, anon, authenticated, service_role;

-- Sends one alert to the root workspace members holding every permission in
-- p_permissions, at most 50. Returns the number of notifications created, or
-- null when the key was already sent. When none is created (no eligible
-- member, or every recipient disabled all channels) the key is released, so
-- a later call can deliver it.
create function private.send_root_operator_alert(
  p_kind text, p_dedupe_key text, p_title text, p_description text,
  p_data jsonb, p_permissions text[], p_priority public.notification_priority
) returns integer
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  root_id constant uuid := '00000000-0000-0000-0000-000000000000';
  member record;
  notification_id uuid;
  sent integer := 0;
begin
  if length(coalesce(p_title, '')) not between 1 and 200
    or length(coalesce(p_description, '')) > 2000
    or jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object'
    or coalesce(cardinality(p_permissions), 0) not between 1 and 8
    or array_position(p_permissions, null) is not null then
    raise exception 'Invalid operator alert' using errcode = '22023';
  end if;
  insert into private.root_operator_alerts (dedupe_key, kind, recipients)
    values (p_dedupe_key, p_kind, 0)
    on conflict (dedupe_key) do nothing;
  if not found then
    return null;
  end if;
  for member in
    select m.user_id from public.workspace_members m
    where m.ws_id = root_id
      and not exists (
        select 1 from unnest(p_permissions) as required(permission)
        where not public.has_workspace_permission(root_id, m.user_id, required.permission)
      )
    order by m.user_id
    limit 50
  loop
    notification_id := public.create_notification(
      p_ws_id => root_id,
      p_user_id => member.user_id,
      p_type => 'system_announcement',
      p_code => p_kind,
      p_title => p_title,
      p_description => p_description,
      p_data => coalesce(p_data, '{}'::jsonb) || jsonb_build_object('kind', p_kind),
      p_scope => 'workspace',
      p_priority => p_priority
    );
    if notification_id is not null then
      sent := sent + 1;
    end if;
  end loop;
  if sent = 0 then
    delete from private.root_operator_alerts where dedupe_key = p_dedupe_key;
  else
    update private.root_operator_alerts set recipients = sent where dedupe_key = p_dedupe_key;
  end if;
  return sent;
end $$;

-- Monthly budgets in USD. provider 'total' covers every collected provider.
-- No rows means no budget alerts.
create table private.provider_cost_budgets (
  provider text primary key check (provider in ('total', 'github', 'vercel', 'cloudflare')),
  monthly_limit_usd numeric(14,2) not null check (monthly_limit_usd > 0 and monthly_limit_usd < 100000000),
  warn_ratio numeric(4,3) not null default 0.8 check (warn_ratio > 0 and warn_ratio <= 1),
  updated_at timestamptz not null default now()
);
alter table private.provider_cost_budgets enable row level security;
revoke all on private.provider_cost_budgets from public, anon, authenticated, service_role;

-- Sets or clears (p_monthly_limit_usd null) one budget.
create function private.set_provider_cost_budget(
  p_provider text, p_monthly_limit_usd numeric, p_warn_ratio numeric default 0.8
) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if p_monthly_limit_usd is null then
    delete from private.provider_cost_budgets where provider = p_provider;
    return;
  end if;
  insert into private.provider_cost_budgets (provider, monthly_limit_usd, warn_ratio, updated_at)
    values (p_provider, p_monthly_limit_usd, coalesce(p_warn_ratio, 0.8), now())
  on conflict (provider) do update
    set monthly_limit_usd = excluded.monthly_limit_usd, warn_ratio = excluded.warn_ratio,
      updated_at = now();
end $$;

create function private.get_provider_cost_budgets()
returns table (provider text, monthly_limit_usd numeric, warn_ratio numeric, updated_at timestamptz)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select b.provider, b.monthly_limit_usd, b.warn_ratio, b.updated_at
  from private.provider_cost_budgets b order by b.provider;
$$;

-- Evaluates every budget for the month of p_as_of, the last complete UTC day.
-- While the collector can still restate the previous month (the first two
-- days of a month), that month is evaluated again through its last day, so a
-- late charge can still raise its alert. The forecast is the billed month to
-- date projected linearly over the month. A budget alerts once per month and
-- level: 'forecast' when the forecast reaches warn_ratio of the limit,
-- 'exceeded' when the billed month to date reaches the limit. Returns the
-- number of alerts delivered to at least one recipient.
create function private.dispatch_provider_cost_budget_alerts(p_as_of date)
returns integer
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  as_of date;
  month_start date;
  elapsed integer;
  month_days integer;
  budget private.provider_cost_budgets;
  billed numeric;
  forecast numeric;
  level text;
  alerts integer := 0;
  result integer;
begin
  if p_as_of is null or p_as_of > current_date or p_as_of < current_date - 7 then
    raise exception 'p_as_of must be within the last seven days' using errcode = '22023';
  end if;
  -- One dispatch at a time: overlapping runs evaluating different months
  -- could otherwise lock dedupe keys and notification batches in opposite
  -- orders and deadlock.
  perform pg_advisory_xact_lock(hashtextextended('provider_cost_budget_dispatch', 0));
  foreach as_of in array case
    when extract(day from p_as_of) <= 2
      then array[(date_trunc('month', p_as_of) - interval '1 day')::date, p_as_of]
    else array[p_as_of]
  end loop
  month_start := date_trunc('month', as_of)::date;
  elapsed := extract(day from as_of)::integer;
  month_days := extract(day from (date_trunc('month', as_of) + interval '1 month - 1 day'))::integer;
  for budget in select * from private.provider_cost_budgets order by provider limit 20 loop
    select coalesce(sum(l.billed_amount_usd), 0) into billed
    from private.provider_cost_lines l
    where l.usage_date >= month_start and l.usage_date <= as_of
      and (budget.provider = 'total' or l.provider = budget.provider);
    forecast := billed / elapsed * month_days;
    level := case
      when billed >= budget.monthly_limit_usd then 'exceeded'
      when forecast >= budget.monthly_limit_usd * budget.warn_ratio then 'forecast'
    end;
    continue when level is null;
    result := private.send_root_operator_alert(
      'provider_cost_budget',
      format('provider-cost-budget:%s:%s:%s', budget.provider, to_char(month_start, 'YYYY-MM'), level),
      case level
        when 'exceeded' then format('%s spend passed its %s USD monthly budget', budget.provider, budget.monthly_limit_usd)
        else format('%s spend is forecast at %s USD against a %s USD budget', budget.provider, round(forecast, 2), budget.monthly_limit_usd)
      end,
      format('Billed %s USD from %s to %s. Charges are provider-reported and provisional until the invoice is reconciled.',
        round(billed, 2), month_start, as_of),
      jsonb_build_object('provider', budget.provider,
        'month', to_char(month_start, 'YYYY-MM'), 'level', level,
        'billedUsd', round(billed, 2), 'forecastUsd', round(forecast, 2),
        'limitUsd', budget.monthly_limit_usd),
      array['view_finance_stats', 'view_infrastructure'],
      case level when 'exceeded' then 'urgent'::public.notification_priority else 'high'::public.notification_priority end
    );
    if result > 0 then
      alerts := alerts + 1;
    end if;
  end loop;
  end loop;
  return alerts;
end $$;

revoke all on function private.send_root_operator_alert(text,text,text,text,jsonb,text[],public.notification_priority) from public, anon, authenticated;
revoke all on function private.set_provider_cost_budget(text,numeric,numeric) from public, anon, authenticated;
revoke all on function private.get_provider_cost_budgets() from public, anon, authenticated;
revoke all on function private.dispatch_provider_cost_budget_alerts(date) from public, anon, authenticated;
grant execute on function private.send_root_operator_alert(text,text,text,text,jsonb,text[],public.notification_priority) to service_role;
grant execute on function private.set_provider_cost_budget(text,numeric,numeric) to service_role;
grant execute on function private.get_provider_cost_budgets() to service_role;
grant execute on function private.dispatch_provider_cost_budget_alerts(date) to service_role;
