-- Informational provider expenses: never reserve or debit AI credits.
create table if not exists private.external_provider_costs (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  app_id text not null check (length(app_id) between 1 and 128),
  provider text not null check (length(provider) between 1 and 64),
  external_run_id text not null check (length(external_run_id) between 1 and 128),
  service text not null check (length(service) between 1 and 128),
  amount_usd numeric(24,12) not null check (amount_usd >= 0 and amount_usd < 1000000000),
  occurred_at timestamptz not null,
  observed_at timestamptz not null,
  actor_id uuid not null,
  account_id text not null default '' check (length(account_id) <= 128),
  granularity text not null default 'run' check (granularity in ('run', 'account_day')),
  source text not null default 'provider_api' check (source = 'provider_api'),
  updated_at timestamptz not null default now(),
  primary key (ws_id, app_id, provider, external_run_id)
);
alter table private.external_provider_costs enable row level security;
revoke all on private.external_provider_costs from public, anon, authenticated;
grant select, insert, update on private.external_provider_costs to service_role;
create index if not exists external_provider_costs_workspace_date_idx
  on private.external_provider_costs(ws_id, occurred_at desc);

create or replace function private.record_external_provider_cost(
  p_ws_id uuid, p_app_id text, p_actor_id uuid, p_provider text,
  p_external_run_id text, p_service text, p_amount_usd numeric,
  p_occurred_at timestamptz, p_observed_at timestamptz,
  p_account_id text default '', p_granularity text default 'run'
) returns void language sql security invoker set search_path = '' as $$
  insert into private.external_provider_costs
    (ws_id, app_id, actor_id, provider, external_run_id, service, amount_usd, occurred_at, observed_at, account_id, granularity)
  values (p_ws_id, p_app_id, p_actor_id, p_provider, p_external_run_id, p_service,
    p_amount_usd, p_occurred_at, p_observed_at, p_account_id, p_granularity)
  on conflict (ws_id, app_id, provider, external_run_id) do update
    set amount_usd = excluded.amount_usd, service = excluded.service,
        occurred_at = excluded.occurred_at, observed_at = excluded.observed_at,
        actor_id = excluded.actor_id, account_id = excluded.account_id, granularity = excluded.granularity, updated_at = now()
    where excluded.observed_at > private.external_provider_costs.observed_at;
$$;

create or replace function private.get_external_provider_costs(
  p_ws_id uuid, p_from timestamptz, p_to timestamptz
) returns table (month text, app_id text, provider text, service text, runs bigint, amount_usd numeric, last_synced_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select to_char(occurred_at at time zone 'UTC', 'YYYY-MM'), app_id, provider, service,
    count(*), sum(amount_usd), max(updated_at)
  from private.external_provider_costs cost
  where ws_id = p_ws_id and occurred_at >= p_from and occurred_at < p_to
    and (granularity = 'account_day' or not exists (
      select 1 from private.external_provider_costs daily
      where daily.ws_id = cost.ws_id and daily.app_id = cost.app_id and daily.provider = cost.provider
        and daily.granularity = 'account_day'
        and (cost.account_id = '' or cost.account_id = daily.account_id)
        and cost.occurred_at >= daily.occurred_at and cost.occurred_at < daily.occurred_at + interval '1 day'
    ))
  group by 1, 2, 3, 4 order by 1 desc, 2, 3, 4;
$$;
revoke all on function private.record_external_provider_cost(uuid,text,uuid,text,text,text,numeric,timestamptz,timestamptz,text,text) from public, anon, authenticated;
revoke all on function private.get_external_provider_costs(uuid,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function private.record_external_provider_cost(uuid,text,uuid,text,text,text,numeric,timestamptz,timestamptz,text,text) to service_role;
grant execute on function private.get_external_provider_costs(uuid,timestamptz,timestamptz) to service_role;
