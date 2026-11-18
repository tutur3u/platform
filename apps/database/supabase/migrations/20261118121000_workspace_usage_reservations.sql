-- Account rows serialize all admissions and settlements for one meter.
create table private.usage_meter_periods (
  ws_id uuid not null references public.workspaces(id),
  meter text not null check (meter in ('sandbox_seconds','participant_seconds','stored_bytes','transfer_bytes')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  cap bigint not null check (cap >= 0),
  spent bigint not null default 0 check (spent >= 0),
  held bigint not null default 0 check (held >= 0),
  blocked boolean not null default true,
  primary key (ws_id, meter, starts_at),
  exclude using gist (ws_id with =, meter with =, tstzrange(starts_at, ends_at, '[)') with &&)
);

create table private.usage_grants (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id),
  meter text not null,
  source_key text not null unique,
  starts_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > starts_at),
  units bigint not null check (units > 0),
  held bigint not null default 0 check (held >= 0),
  spent bigint not null default 0 check (spent >= 0),
  check (held <= units - spent)
);
create index usage_grants_lookup on private.usage_grants(ws_id, meter, expires_at, id);

create table private.usage_holds (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null,
  meter text not null,
  starts_at timestamptz not null,
  operation_id uuid not null,
  requested bigint not null check (requested > 0),
  deadline timestamptz not null,
  settled bigint check (settled between 0 and requested),
  foreign key (ws_id, meter, starts_at) references private.usage_meter_periods,
  unique (ws_id, meter, operation_id)
);
create table private.usage_hold_allocations (
  hold_id uuid not null references private.usage_holds,
  grant_id uuid not null references private.usage_grants,
  units bigint not null check (units > 0),
  primary key (hold_id, grant_id)
);

alter table private.usage_meter_periods enable row level security;
alter table private.usage_grants enable row level security;
alter table private.usage_holds enable row level security;
alter table private.usage_hold_allocations enable row level security;
revoke all on private.usage_meter_periods, private.usage_grants,
  private.usage_holds, private.usage_hold_allocations from public, anon, authenticated, service_role;

create function public.reserve_workspace_usage(
  p_ws uuid, p_meter text, p_operation uuid, p_units bigint, p_deadline timestamptz
) returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  period private.usage_meter_periods;
  existing private.usage_holds;
  lot private.usage_grants;
  remaining bigint := p_units;
  take bigint;
  hold_id uuid;
begin
  -- Serialize retries even across billing-period rollover.
  perform pg_advisory_xact_lock(hashtextextended(p_operation::text, 0));
  select * into existing from private.usage_holds
    where ws_id = p_ws and meter = p_meter and operation_id = p_operation;
  if found then
    if existing.requested is distinct from p_units or existing.deadline is distinct from p_deadline then
      raise exception 'Conflicting usage operation';
    end if;
    return existing.id;
  end if;
  select * into strict period from private.usage_meter_periods where ws_id = p_ws
    and meter = p_meter and starts_at <= clock_timestamp() and ends_at > clock_timestamp() for update;
  if period.blocked or p_units is null or p_units <= 0 or p_deadline is null
    or p_deadline <= clock_timestamp() or p_deadline > least(period.ends_at, clock_timestamp() + interval '60 seconds')
    or p_units > period.cap - period.spent - period.held then
    raise exception 'Usage admission denied';
  end if;
  insert into private.usage_holds(ws_id,meter,starts_at,operation_id,requested,deadline)
    values (p_ws,p_meter,period.starts_at,p_operation,p_units,p_deadline) returning id into hold_id;
  for lot in select * from private.usage_grants where ws_id = p_ws and meter = p_meter
    and starts_at <= clock_timestamp() and expires_at >= p_deadline and units - spent > held
    order by expires_at, id for update loop
    take := least(remaining, lot.units - lot.spent - lot.held);
    update private.usage_grants set held = held + take where id = lot.id;
    insert into private.usage_hold_allocations values (hold_id, lot.id, take);
    remaining := remaining - take;
    exit when remaining = 0;
  end loop;
  if remaining <> 0 then raise exception 'Insufficient usage grants'; end if;
  update private.usage_meter_periods set held = held + p_units
    where ws_id = p_ws and meter = p_meter and starts_at = period.starts_at;
  return hold_id;
end $$;

create function public.settle_workspace_usage(p_ws uuid, p_hold uuid, p_actual bigint)
returns bigint language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  reservation private.usage_holds;
  allocation record;
  remaining bigint := p_actual;
  debit bigint;
begin
  select * into strict reservation from private.usage_holds where id = p_hold and ws_id = p_ws for update;
  if p_actual is null or p_actual < 0 or p_actual > reservation.requested then raise exception 'Invalid usage'; end if;
  if reservation.settled is not null then
    if reservation.settled <> p_actual then raise exception 'Conflicting usage settlement'; end if;
    return p_actual;
  end if;
  update private.usage_meter_periods set held = held - reservation.requested, spent = spent + p_actual
    where ws_id = p_ws and meter = reservation.meter and starts_at = reservation.starts_at;
  for allocation in select a.grant_id, a.units from private.usage_hold_allocations a
    join private.usage_grants g on g.id = a.grant_id where a.hold_id = p_hold
    order by g.expires_at, g.id loop
    debit := least(remaining, allocation.units);
    update private.usage_grants set held = held - allocation.units, spent = spent + debit
      where id = allocation.grant_id;
    remaining := remaining - debit;
  end loop;
  if remaining <> 0 then raise exception 'Invalid reservation allocations'; end if;
  update private.usage_holds set settled = p_actual where id = p_hold;
  return p_actual;
end $$;

revoke all on function public.reserve_workspace_usage(uuid,text,uuid,bigint,timestamptz),
  public.settle_workspace_usage(uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.reserve_workspace_usage(uuid,text,uuid,bigint,timestamptz),
  public.settle_workspace_usage(uuid,uuid,bigint) to service_role;
