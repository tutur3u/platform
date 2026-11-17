create table if not exists private.cite_budget_counters (
  scope text not null,
  window_minute bigint not null,
  actor_hash text not null check (actor_hash = '' or actor_hash ~ '^[a-f0-9]{64}$'),
  used integer not null check (used >= 0),
  primary key (scope, window_minute, actor_hash)
);

alter table private.cite_budget_counters enable row level security;
revoke all on private.cite_budget_counters from public, anon, authenticated, service_role;

create or replace function private.reserve_cite_budget(
  p_scope text, p_actor_hash text, p_window bigint, p_actor_limit integer, p_global_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_minute bigint := floor(extract(epoch from clock_timestamp()) / 60);
  v_global integer;
  v_actor integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'Citation budget access denied';
  end if;
  if p_scope is null or p_scope not in ('lookup', 'format', 'ground')
    or p_actor_hash is null or p_actor_hash !~ '^[a-f0-9]{64}$'
    or p_window is null or p_window not between v_minute - 1 and v_minute + 1
    or p_actor_limit is null or p_actor_limit not between 1 and 30
    or p_global_limit is null or p_global_limit not between p_actor_limit and 600
  then
    raise invalid_parameter_value using message = 'Invalid citation budget';
  end if;

  delete from private.cite_budget_counters
    where (scope, window_minute, actor_hash) in (
      select scope, window_minute, actor_hash from private.cite_budget_counters
      where scope = p_scope and window_minute < v_minute - 1
      order by window_minute, actor_hash limit 64 for update skip locked
    );

  -- The global row serializes both counters for this scope and minute.
  insert into private.cite_budget_counters values (p_scope, p_window, '', 0)
    on conflict do nothing;
  select used into v_global from private.cite_budget_counters
    where scope = p_scope and window_minute = p_window and actor_hash = ''
    for update;
  if not found then
    raise serialization_failure using message = 'Citation budget window expired';
  end if;
  if v_global >= p_global_limit then return false; end if;

  select used into v_actor from private.cite_budget_counters
    where scope = p_scope and window_minute = p_window and actor_hash = p_actor_hash;
  if coalesce(v_actor, 0) >= p_actor_limit then return false; end if;

  insert into private.cite_budget_counters as c values (p_scope, p_window, p_actor_hash, 1)
    on conflict (scope, window_minute, actor_hash) do update set used = c.used + 1;
  update private.cite_budget_counters set used = used + 1
    where scope = p_scope and window_minute = p_window and actor_hash = '';
  return true;
end;
$$;

create table if not exists private.cite_ai_operations (
  operation_id uuid primary key,
  user_id uuid not null,
  record jsonb not null check (jsonb_typeof(record) = 'object' and octet_length(record::text) <= 100000),
  first_claimed_at timestamptz not null,
  expires_at timestamptz not null,
  actor_lock_until timestamptz,
  deduction_claimed boolean not null default false
);

create index if not exists cite_ai_operations_actor_idx
  on private.cite_ai_operations (user_id, actor_lock_until)
  where actor_lock_until is not null;
create index if not exists cite_ai_operations_expiry_idx
  on private.cite_ai_operations (expires_at);
alter table private.cite_ai_operations enable row level security;
revoke all on private.cite_ai_operations from public, anon, authenticated, service_role;

create or replace function private.claim_cite_ai_operation(
  p_operation_id uuid, p_actor_id uuid, p_binding jsonb, p_retry_only boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz;
  v_existing private.cite_ai_operations%rowtype;
  v_retry boolean;
  v_record jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'Citation operation access denied';
  end if;
  if p_operation_id is null or p_actor_id is null or p_retry_only is null
    or (p_binding ->> 'userId') is distinct from p_actor_id::text
  then
    raise invalid_parameter_value using message = 'Invalid citation operation binding';
  end if;

  perform pg_advisory_xact_lock(185941, hashtext(p_actor_id::text));
  perform pg_advisory_xact_lock(185942, hashtext(p_operation_id::text));
  select * into v_existing from private.cite_ai_operations
    where operation_id = p_operation_id for update;
  v_now := clock_timestamp();
  if v_existing.expires_at > v_now then
    if v_existing.user_id <> p_actor_id then
      return '{"kind":"conflict"}'::jsonb;
    end if;
    return jsonb_build_object('kind', 'existing', 'record', v_existing.record);
  end if;

  -- A receipt with no checkpoint can reopen for its original binding even
  -- after the UUID admission window. Keep that permission for one hour total.
  v_retry := v_existing.record @> '{"stage":"failed","code":"BILLING_PENDING"}'
    and v_existing.first_claimed_at + interval '1 hour' > v_now
    and not v_existing.deduction_claimed;
  if v_retry is true and (v_existing.record -> 'binding') is distinct from p_binding then
    return '{"kind":"conflict"}'::jsonb;
  end if;
  if v_retry is not true and (p_retry_only or v_existing.operation_id is not null) then
    return '{"kind":"expired"}'::jsonb;
  end if;

  if exists (
    select 1 from private.cite_ai_operations
    where user_id = p_actor_id and actor_lock_until > v_now
  ) then
    return '{"kind":"busy"}'::jsonb;
  end if;

  v_record := jsonb_build_object(
    'stage', 'running', 'binding', p_binding, 'attemptId', gen_random_uuid()
  );
  insert into private.cite_ai_operations
    (operation_id, user_id, record, first_claimed_at, expires_at, actor_lock_until)
  values (
    p_operation_id, p_actor_id, v_record, v_now,
    v_now + interval '1 hour', v_now + interval '120 seconds'
  )
  on conflict (operation_id) do update set
    record = excluded.record,
    expires_at = excluded.expires_at,
    actor_lock_until = excluded.actor_lock_until;

  delete from private.cite_ai_operations where operation_id in (
    select operation_id from private.cite_ai_operations
    where expires_at <= v_now and operation_id <> p_operation_id
      and (not (record @> '{"stage":"failed","code":"BILLING_PENDING"}')
        or first_claimed_at + interval '1 hour' <= v_now)
    order by expires_at limit 64 for update skip locked
  );
  return jsonb_build_object('kind', 'claimed', 'record', v_record);
end;
$$;

create or replace function private.read_cite_ai_operation(p_operation_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_existing private.cite_ai_operations%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'Citation operation access denied';
  end if;
  select * into v_existing from private.cite_ai_operations
    where operation_id = p_operation_id and expires_at > clock_timestamp();
  if not found then return null; end if;
  if v_existing.user_id is distinct from p_actor_id then
    return '{"kind":"conflict"}'::jsonb;
  end if;
  return jsonb_build_object('kind', 'existing', 'record', v_existing.record);
end;
$$;

create or replace function private.transition_cite_ai_operation(
  p_operation_id uuid, p_actor_id uuid, p_previous jsonb, p_next jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz;
  v_stage text := p_next ->> 'stage';
  v_previous text := p_previous ->> 'stage';
  v_pending boolean := p_next @> '{"stage":"failed","code":"BILLING_PENDING"}';
  v_pending_reconcile_seconds constant integer := 900;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'Citation operation access denied';
  end if;
  if (p_previous -> 'binding') is distinct from (p_next -> 'binding')
    or (p_previous ->> 'attemptId') is distinct from (p_next ->> 'attemptId')
    or ((v_previous = 'running' and v_stage in ('running', 'failed', 'checkpoint'))
      or (v_previous = 'checkpoint' and v_stage = 'settling')
      or (v_previous in ('checkpoint', 'settling') and v_stage = 'settled')) is not true
  then
    return false;
  end if;

  perform pg_advisory_xact_lock(185941, hashtext(p_actor_id::text));
  v_now := clock_timestamp();
  update private.cite_ai_operations
  set record = p_next,
      expires_at = v_now + case when v_pending then make_interval(secs => v_pending_reconcile_seconds)
        else interval '1 hour' end,
      actor_lock_until = case
        when v_pending or v_stage = 'settling' then v_now + make_interval(secs => v_pending_reconcile_seconds)
        when v_stage in ('running', 'checkpoint') then v_now + interval '120 seconds'
        else null
      end
  where operation_id = p_operation_id and user_id = p_actor_id and record = p_previous
    and expires_at > v_now
    and (v_stage = 'settled' or actor_lock_until > v_now)
    and (v_stage <> 'settling' or not deduction_claimed);
  return found;
end;
$$;

create or replace function private.claim_cite_ai_deduction(
  p_operation_id uuid, p_actor_id uuid, p_checkpoint jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'Citation operation access denied';
  end if;

  -- Keep the dispatch fence for the entire receipt, including unknown RPC outcomes.
  update private.cite_ai_operations set deduction_claimed = true
    where operation_id = p_operation_id and user_id = p_actor_id
      and record = p_checkpoint and record ->> 'stage' in ('checkpoint', 'settling')
      and expires_at > clock_timestamp() and not deduction_claimed;
  return found;
end;
$$;

revoke all on function
  private.reserve_cite_budget(text, text, bigint, integer, integer),
  private.claim_cite_ai_operation(uuid, uuid, jsonb, boolean),
  private.read_cite_ai_operation(uuid, uuid),
  private.transition_cite_ai_operation(uuid, uuid, jsonb, jsonb),
  private.claim_cite_ai_deduction(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function
  private.reserve_cite_budget(text, text, bigint, integer, integer),
  private.claim_cite_ai_operation(uuid, uuid, jsonb, boolean),
  private.read_cite_ai_operation(uuid, uuid),
  private.transition_cite_ai_operation(uuid, uuid, jsonb, jsonb),
  private.claim_cite_ai_deduction(uuid, uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';
