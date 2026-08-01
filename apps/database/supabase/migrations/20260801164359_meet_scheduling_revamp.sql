alter table public.meet_together_plans
  add column if not exists timezone text,
  add column if not exists duration_minutes integer not null default 60,
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references public.users(id) on update cascade on delete set null;

alter table public.meet_together_plans
  add constraint meet_together_plans_duration_minutes_check
  check (
    duration_minutes between 15 and 1440
    and duration_minutes % 15 = 0
  ) not valid;

alter table public.meet_together_plans
  validate constraint meet_together_plans_duration_minutes_check;

create table if not exists public.meet_together_finalized_timeframes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meet_together_plans(id) on update cascade on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  position integer not null default 0,
  created_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meet_together_finalized_timeframes_range_check check (end_at > start_at),
  constraint meet_together_finalized_timeframes_position_check check (position >= 0),
  constraint meet_together_finalized_timeframes_unique_range unique (plan_id, start_at, end_at),
  constraint meet_together_finalized_timeframes_unique_position unique (plan_id, position)
);

create index if not exists meet_together_finalized_timeframes_plan_idx
  on public.meet_together_finalized_timeframes(plan_id, position);

alter table public.meet_together_finalized_timeframes enable row level security;

revoke all on table public.meet_together_finalized_timeframes from anon, authenticated;
grant select, insert, update, delete on table public.meet_together_finalized_timeframes to service_role;

create or replace function private.validate_meet_finalized_timeframe()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  plan_row public.meet_together_plans%rowtype;
  local_start timestamp;
  local_end timestamp;
begin
  select *
  into plan_row
  from public.meet_together_plans
  where id = new.plan_id
  for update;

  if not found then
    raise exception 'Meet plan not found';
  end if;

  if extract(epoch from (new.end_at - new.start_at)) / 60 <> plan_row.duration_minutes then
    raise exception 'Finalized timeframe must match the plan duration';
  end if;

  if extract(minute from new.start_at) % 15 <> 0
    or extract(second from new.start_at) <> 0
    or extract(minute from new.end_at) % 15 <> 0
    or extract(second from new.end_at) <> 0 then
    raise exception 'Finalized timeframe must align to 15-minute boundaries';
  end if;

  if plan_row.timezone is null then
    local_start := (new.start_at at time zone 'UTC')
      + make_interval(secs => extract(timezone from plan_row.start_time)::integer);
    local_end := (new.end_at at time zone 'UTC')
      + make_interval(secs => extract(timezone from plan_row.end_time)::integer);
  else
    local_start := new.start_at at time zone plan_row.timezone;
    local_end := new.end_at at time zone plan_row.timezone;
  end if;

  if not (local_start::date = any(plan_row.dates))
    or local_start::date <> local_end::date
    or local_start::time < plan_row.start_time::time
    or local_end::time > plan_row.end_time::time then
    raise exception 'Finalized timeframe falls outside the plan window';
  end if;

  if exists (
    select 1
    from public.meet_together_finalized_timeframes existing
    where existing.plan_id = new.plan_id
      and existing.id <> new.id
      and tstzrange(existing.start_at, existing.end_at, '[)')
        && tstzrange(new.start_at, new.end_at, '[)')
  ) then
    raise exception 'Finalized timeframes cannot overlap';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_meet_finalized_timeframe
  on public.meet_together_finalized_timeframes;
create trigger validate_meet_finalized_timeframe
before insert or update on public.meet_together_finalized_timeframes
for each row execute function private.validate_meet_finalized_timeframe();

create or replace function private.replace_meet_availability(
  p_plan_id uuid,
  p_user_id uuid,
  p_is_guest boolean,
  p_timeblocks jsonb
)
returns setof jsonb
language plpgsql
set search_path = ''
as $$
declare
  plan_row public.meet_together_plans%rowtype;
begin
  if jsonb_typeof(p_timeblocks) <> 'array' or jsonb_array_length(p_timeblocks) > 512 then
    raise exception 'Invalid availability payload';
  end if;

  select *
  into plan_row
  from public.meet_together_plans
  where id = p_plan_id
  for update;

  if not found then
    raise exception 'Meet plan not found';
  end if;

  if plan_row.is_confirmed then
    raise exception 'Meet plan is finalized';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_timeblocks) as payload(
      date date,
      start_time timetz,
      end_time timetz,
      tentative boolean
    )
    where payload.date is null
      or payload.start_time is null
      or payload.end_time is null
      or not (payload.date = any(plan_row.dates))
      or payload.start_time::time < plan_row.start_time::time
      or payload.end_time::time > plan_row.end_time::time
      or payload.end_time <= payload.start_time
      or extract(minute from payload.start_time) % 15 <> 0
      or extract(second from payload.start_time) <> 0
      or extract(minute from payload.end_time) % 15 <> 0
      or extract(second from payload.end_time) <> 0
  ) then
    raise exception 'Availability falls outside the plan window or is not aligned to 15 minutes';
  end if;

  if p_is_guest then
    delete from public.meet_together_guest_timeblocks
    where plan_id = p_plan_id and user_id = p_user_id;

    insert into public.meet_together_guest_timeblocks (
      plan_id, user_id, date, start_time, end_time, tentative
    )
    select
      p_plan_id,
      p_user_id,
      payload.date,
      payload.start_time,
      payload.end_time,
      coalesce(payload.tentative, false)
    from jsonb_to_recordset(p_timeblocks) as payload(
      date date,
      start_time timetz,
      end_time timetz,
      tentative boolean
    );

    return query
    select to_jsonb(timeblock)
    from public.meet_together_guest_timeblocks timeblock
    where plan_id = p_plan_id and user_id = p_user_id
    order by date, start_time;
  else
    delete from public.meet_together_user_timeblocks
    where plan_id = p_plan_id and user_id = p_user_id;

    insert into public.meet_together_user_timeblocks (
      plan_id, user_id, date, start_time, end_time, tentative
    )
    select
      p_plan_id,
      p_user_id,
      payload.date,
      payload.start_time,
      payload.end_time,
      coalesce(payload.tentative, false)
    from jsonb_to_recordset(p_timeblocks) as payload(
      date date,
      start_time timetz,
      end_time timetz,
      tentative boolean
    );

    return query
    select to_jsonb(timeblock)
    from public.meet_together_user_timeblocks timeblock
    where plan_id = p_plan_id and user_id = p_user_id
    order by date, start_time;
  end if;
end;
$$;

create or replace function private.replace_meet_finalized_timeframes(
  p_plan_id uuid,
  p_actor_id uuid,
  p_timeframes jsonb
)
returns setof public.meet_together_finalized_timeframes
language plpgsql
set search_path = ''
as $$
declare
  plan_creator uuid;
begin
  if jsonb_typeof(p_timeframes) <> 'array' or jsonb_array_length(p_timeframes) > 32 then
    raise exception 'Invalid finalized timeframe payload';
  end if;

  select creator_id
  into plan_creator
  from public.meet_together_plans
  where id = p_plan_id
  for update;

  if not found then
    raise exception 'Meet plan not found';
  end if;

  if plan_creator is distinct from p_actor_id then
    raise exception 'Only the plan creator can finalize this plan';
  end if;

  delete from public.meet_together_finalized_timeframes
  where plan_id = p_plan_id;

  if jsonb_array_length(p_timeframes) = 0 then
    update public.meet_together_plans
    set is_confirmed = false, finalized_at = null, finalized_by = null
    where id = p_plan_id;
    return;
  end if;

  insert into public.meet_together_finalized_timeframes (
    plan_id, start_at, end_at, position, created_by
  )
  select
    p_plan_id,
    payload.start_at,
    payload.end_at,
    payload.position,
    p_actor_id
  from jsonb_to_recordset(p_timeframes) as payload(
    start_at timestamptz,
    end_at timestamptz,
    position integer
  );

  update public.meet_together_plans
  set is_confirmed = true, finalized_at = now(), finalized_by = p_actor_id
  where id = p_plan_id;

  return query
  select timeframe.*
  from public.meet_together_finalized_timeframes timeframe
  where timeframe.plan_id = p_plan_id
  order by timeframe.position;
end;
$$;

revoke all on function private.validate_meet_finalized_timeframe() from public, anon, authenticated;
revoke all on function private.replace_meet_availability(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke all on function private.replace_meet_finalized_timeframes(uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function private.validate_meet_finalized_timeframe() to service_role;
grant execute on function private.replace_meet_availability(uuid, uuid, boolean, jsonb) to service_role;
grant execute on function private.replace_meet_finalized_timeframes(uuid, uuid, jsonb) to service_role;

comment on column public.meet_together_plans.timezone is
  'IANA timezone for Tuturuuu Meet. Null preserves the fixed-offset behavior of legacy plans.';
comment on table public.meet_together_finalized_timeframes is
  'Organizer-selected final alternatives for a Tuturuuu Meet scheduling plan.';
