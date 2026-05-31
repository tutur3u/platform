create schema if not exists extensions;
create schema if not exists private;
create extension if not exists vector with schema extensions;
grant usage on schema private to service_role;

alter table public.tasks
  alter column embedding type extensions.halfvec(3072) using null;

drop index if exists public.tasks_embedding_idx;
create index if not exists tasks_embedding_hnsw_idx on public.tasks
using hnsw (embedding extensions.halfvec_cosine_ops);

drop function if exists public.match_tasks(
  extensions.vector,
  text,
  float,
  int,
  uuid,
  boolean
);

drop function if exists public.match_tasks(
  extensions.halfvec,
  text,
  float,
  int,
  uuid,
  boolean
);

create or replace function public.match_tasks (
  query_embedding extensions.halfvec(3072),
  query_text text,
  match_threshold float default 0.3,
  match_count int default 50,
  filter_ws_id uuid default null,
  filter_deleted boolean default false
) returns table (
  id uuid,
  name text,
  description text,
  list_id uuid,
  list_name text,
  list_status task_board_status,
  board_id uuid,
  board_name text,
  priority task_priority,
  start_date timestamptz,
  end_date timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz,
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  with semantic_search as (
    select
      tasks.id,
      (1.0 - (tasks.embedding <=> query_embedding)) as semantic_similarity,
      row_number() over (order by tasks.embedding <=> query_embedding) as semantic_rank
    from public.tasks
    inner join public.task_lists on tasks.list_id = task_lists.id
    inner join public.workspace_boards on task_lists.board_id = workspace_boards.id
    where
      tasks.embedding is not null
      and (filter_ws_id is null or workspace_boards.ws_id = filter_ws_id)
      and (filter_deleted or tasks.deleted_at is null)
    order by tasks.embedding <=> query_embedding
    limit least(match_count * 3, 150)
  ),
  keyword_search as (
    select
      tasks.id,
      ts_rank_cd(tasks.fts, websearch_to_tsquery('english', query_text)) as keyword_score,
      row_number() over (
        order by ts_rank_cd(tasks.fts, websearch_to_tsquery('english', query_text)) desc
      ) as keyword_rank
    from public.tasks
    inner join public.task_lists on tasks.list_id = task_lists.id
    inner join public.workspace_boards on task_lists.board_id = workspace_boards.id
    where
      tasks.fts @@ websearch_to_tsquery('english', query_text)
      and (filter_ws_id is null or workspace_boards.ws_id = filter_ws_id)
      and (filter_deleted or tasks.deleted_at is null)
    order by ts_rank_cd(tasks.fts, websearch_to_tsquery('english', query_text)) desc
    limit least(match_count * 3, 150)
  ),
  combined_results as (
    select
      coalesce(s.id, k.id) as id,
      coalesce(s.semantic_similarity, 0.0) as semantic_similarity,
      coalesce(k.keyword_score, 0.0) as keyword_score,
      (coalesce(1.0 / (60 + s.semantic_rank), 0.0) +
       coalesce(1.0 / (60 + k.keyword_rank), 0.0)) as reciprocal_rank_score,
      (coalesce(k.keyword_score, 0.0) * 0.7 + coalesce(s.semantic_similarity, 0.0) * 0.3) as combined_score
    from semantic_search s
    full outer join keyword_search k on s.id = k.id
  ),
  ranked_results as (
    select
      tasks.id,
      tasks.name,
      tasks.description,
      tasks.list_id,
      task_lists.name as list_name,
      task_lists.status as list_status,
      workspace_boards.id as board_id,
      workspace_boards.name as board_name,
      tasks.priority,
      tasks.start_date,
      tasks.end_date,
      tasks.completed_at,
      tasks.closed_at,
      tasks.created_at,
      cr.combined_score,
      cr.reciprocal_rank_score,
      case
        when task_lists.status in ('active', 'not_started') then 1.0
        else 0.5
      end as status_boost,
      (cr.reciprocal_rank_score * 0.7 +
       cr.combined_score * 0.15 +
       case
         when task_lists.status in ('active', 'not_started') then 0.15
         else 0.0
       end) as final_score
    from combined_results cr
    inner join public.tasks on tasks.id = cr.id
    inner join public.task_lists on tasks.list_id = task_lists.id
    inner join public.workspace_boards on task_lists.board_id = workspace_boards.id
    where (filter_ws_id is null or workspace_boards.ws_id = filter_ws_id)
      and (filter_deleted or tasks.deleted_at is null)
      and cr.combined_score >= match_threshold
  )
  select
    id,
    name,
    description,
    list_id,
    list_name,
    list_status,
    board_id,
    board_name,
    priority,
    start_date,
    end_date,
    completed_at,
    closed_at,
    created_at,
    final_score::float as similarity
  from ranked_results
  order by final_score desc
  limit least(match_count, 200);
end;
$$;

grant execute on function public.match_tasks(
  extensions.halfvec,
  text,
  float,
  int,
  uuid,
  boolean
) to authenticated;

comment on column public.tasks.embedding is
  'Google Gemini gemini-embedding-2 embedding vector (3072 dimensions) stored as pgvector halfvec for HNSW cosine search.';

comment on function public.match_tasks(
  extensions.halfvec,
  text,
  float,
  int,
  uuid,
  boolean
) is
  'Hybrid semantic and keyword search for tasks using gemini-embedding-2 3072-dimensional halfvec embeddings and reciprocal-rank-style scoring.';

insert into public.ai_gateway_models (
  id,
  name,
  provider,
  description,
  type,
  context_window,
  max_tokens,
  tags,
  input_price_per_token,
  output_price_per_token,
  released_at,
  is_enabled,
  synced_at
)
values (
  'google/gemini-embedding-2',
  'Gemini Embedding 2',
  'google',
  'Google Gemini Embedding 2 multimodal embedding model. Default output dimension is 3072.',
  'embedding',
  8192,
  3072,
  array['embedding', 'multimodal', 'gemini'],
  0.0000002,
  0,
  '2026-04-22T00:00:00Z',
  true,
  now()
)
on conflict (id) do update set
  name = excluded.name,
  provider = excluded.provider,
  description = excluded.description,
  type = excluded.type,
  context_window = excluded.context_window,
  max_tokens = excluded.max_tokens,
  tags = excluded.tags,
  input_price_per_token = excluded.input_price_per_token,
  output_price_per_token = excluded.output_price_per_token,
  released_at = excluded.released_at,
  is_enabled = true,
  synced_at = now();

update public.ai_credit_plan_allocations
set
  allowed_features = case
    when array_position(coalesce(allowed_features, array[]::text[]), 'embeddings') is null
      then coalesce(allowed_features, array[]::text[]) || array['embeddings']
    else allowed_features
  end,
  allowed_models = case
    when coalesce(array_length(allowed_models, 1), 0) = 0
      then allowed_models
    when array_position(allowed_models, 'google/gemini-embedding-2') is null
      then allowed_models || array['google/gemini-embedding-2']
    else allowed_models
  end,
  updated_at = now()
where is_active = true;

insert into public.ai_credit_feature_access (tier, feature, enabled, max_requests_per_day)
values
  ('FREE', 'embeddings', true, null),
  ('PLUS', 'embeddings', true, null),
  ('PRO', 'embeddings', true, null),
  ('ENTERPRISE', 'embeddings', true, null)
on conflict (tier, feature) do update set
  enabled = excluded.enabled,
  max_requests_per_day = excluded.max_requests_per_day;

create table if not exists private.ai_embedding_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  balance_id uuid not null references public.workspace_ai_credit_balances(id) on delete cascade,
  amount numeric(14,4) not null check (amount > 0),
  included_amount numeric(14,4) not null default 0,
  payg_amount numeric(14,4) not null default 0,
  payg_purchases jsonb not null default '[]'::jsonb,
  model_id text not null,
  feature text not null default 'embeddings',
  input_tokens integer not null default 0,
  cost_usd numeric(14,8) not null default 0,
  status text not null check (status in ('reserved', 'committed', 'released', 'expired')),
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  committed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.ai_embedding_credit_reservations enable row level security;

drop policy if exists "Service role can manage embedding credit reservations"
  on private.ai_embedding_credit_reservations;
create policy "Service role can manage embedding credit reservations"
  on private.ai_embedding_credit_reservations for all
  to service_role
  using (true)
  with check (true);

create index if not exists ai_embedding_credit_reservations_balance_status_idx
  on private.ai_embedding_credit_reservations (balance_id, status, expires_at);

create index if not exists ai_embedding_credit_reservations_ws_created_idx
  on private.ai_embedding_credit_reservations (ws_id, created_at desc);

revoke all on table private.ai_embedding_credit_reservations from anon, authenticated;
grant all on table private.ai_embedding_credit_reservations to service_role;

create or replace function public._release_expired_embedding_credit_reservations(
  p_balance_id uuid
)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_reservation record;
  v_purchase jsonb;
begin
  for v_reservation in
    select *
    from private.ai_embedding_credit_reservations
    where balance_id = p_balance_id
      and status = 'reserved'
      and expires_at <= now()
    for update
  loop
    if v_reservation.included_amount > 0 then
      update public.workspace_ai_credit_balances
      set total_used = greatest(total_used - v_reservation.included_amount, 0),
          updated_at = now()
      where id = v_reservation.balance_id;
    end if;

    for v_purchase in
      select * from jsonb_array_elements(coalesce(v_reservation.payg_purchases, '[]'::jsonb))
    loop
      update public.workspace_credit_pack_purchases
      set tokens_remaining = tokens_remaining + coalesce((v_purchase ->> 'amount')::numeric, 0),
          status = 'active',
          updated_at = now()
      where id = (v_purchase ->> 'id')::uuid;
    end loop;

    update private.ai_embedding_credit_reservations
    set status = 'expired',
        released_at = now(),
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expired_at', now())
    where id = v_reservation.id;
  end loop;
end;
$$;

create or replace function public.reserve_metered_embedding_credits(
  p_ws_id uuid,
  p_user_id uuid,
  p_model_id text,
  p_input_tokens integer,
  p_feature text default 'embeddings',
  p_metadata jsonb default '{}'::jsonb,
  p_expires_in_seconds integer default 1800
)
returns table (
  success boolean,
  reservation_id uuid,
  credits_reserved numeric,
  cost_usd numeric,
  remaining_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_tier workspace_product_tier;
  v_allocation record;
  v_model record;
  v_feature_access record;
  v_balance record;
  v_cost_usd numeric;
  v_credits numeric;
  v_included_remaining numeric;
  v_payg_remaining numeric;
  v_included_to_consume numeric;
  v_payg_to_consume numeric;
  v_payg_consumed numeric := 0;
  v_pack record;
  v_take numeric;
  v_payg_purchases jsonb := '[]'::jsonb;
  v_new_total_used numeric;
  v_reservation_id uuid;
  v_remaining numeric;
begin
  if p_ws_id is null or coalesce(p_input_tokens, 0) <= 0 then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'INVALID_REQUEST'::text;
    return;
  end if;

  v_tier := public._resolve_workspace_tier(p_ws_id);

  select * into v_allocation
  from public.ai_credit_plan_allocations
  where tier = v_tier
    and is_active = true;

  if not found then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'NO_ALLOCATION'::text;
    return;
  end if;

  if array_length(v_allocation.allowed_models, 1) > 0 then
    if not exists (
      select 1
      from unnest(v_allocation.allowed_models) as allowed_model
      where allowed_model = p_model_id
        or allowed_model = split_part(p_model_id, '/', 2)
        or split_part(allowed_model, '/', 2) = p_model_id
        or split_part(allowed_model, '/', 2) = split_part(p_model_id, '/', 2)
    ) then
      return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'MODEL_NOT_ALLOWED'::text;
      return;
    end if;
  end if;

  select * into v_feature_access
  from public.ai_credit_feature_access
  where tier = v_tier
    and feature = p_feature;

  if not found or not v_feature_access.enabled then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'FEATURE_NOT_ALLOWED'::text;
    return;
  end if;

  select * into v_model
  from public.ai_gateway_models
  where id = p_model_id
    and type = 'embedding'
    and is_enabled = true;

  if not found or coalesce(v_model.input_price_per_token, 0) <= 0 then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'MODEL_PRICING_UNAVAILABLE'::text;
    return;
  end if;

  select * into v_balance
  from public.get_or_create_credit_balance(p_ws_id, p_user_id);

  if not found then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  perform public._release_expired_embedding_credit_reservations(v_balance.id);

  select * into v_balance
  from public.workspace_ai_credit_balances
  where id = v_balance.id
  for update;

  if not found then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  v_cost_usd := public.compute_ai_cost_from_gateway(
    p_model_id,
    p_input_tokens,
    0,
    0,
    0,
    0
  );
  v_credits := (v_cost_usd / 0.0001) * coalesce(v_allocation.markup_multiplier, 1.0);

  if v_credits < 1 then
    v_credits := 1;
  end if;

  v_included_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used;
  v_payg_remaining := public._get_active_payg_credits(p_ws_id);

  if (v_included_remaining + coalesce(v_payg_remaining, 0)) < v_credits then
    return query
    select false, null::uuid, v_credits, v_cost_usd,
      (v_included_remaining + coalesce(v_payg_remaining, 0))::numeric,
      'INSUFFICIENT_CREDITS'::text;
    return;
  end if;

  v_included_to_consume := least(greatest(v_included_remaining, 0), v_credits);
  v_payg_to_consume := v_credits - v_included_to_consume;

  if v_payg_to_consume > 0 then
    for v_pack in
      select id, tokens_remaining
      from public.workspace_credit_pack_purchases
      where ws_id = p_ws_id
        and status = 'active'
        and expires_at > now()
        and tokens_remaining > 0
      order by expires_at asc, granted_at asc, created_at asc
      for update
    loop
      exit when v_payg_to_consume <= 0;
      v_take := least(v_pack.tokens_remaining, v_payg_to_consume);

      update public.workspace_credit_pack_purchases
      set tokens_remaining = tokens_remaining - v_take,
          status = case when tokens_remaining - v_take <= 0 then 'canceled' else 'active' end,
          updated_at = now()
      where id = v_pack.id;

      v_payg_to_consume := v_payg_to_consume - v_take;
      v_payg_consumed := v_payg_consumed + v_take;
      v_payg_purchases := v_payg_purchases || jsonb_build_array(
        jsonb_build_object('id', v_pack.id, 'amount', v_take)
      );
    end loop;

    if v_payg_to_consume > 0 then
      raise exception 'INSUFFICIENT_CREDITS: PAYG shortfall';
    end if;
  end if;

  if v_included_to_consume > 0 then
    update public.workspace_ai_credit_balances
    set total_used = total_used + v_included_to_consume,
        updated_at = now()
    where id = v_balance.id
    returning total_used into v_new_total_used;
  else
    v_new_total_used := v_balance.total_used;
  end if;

  insert into private.ai_embedding_credit_reservations (
    ws_id,
    user_id,
    balance_id,
    amount,
    included_amount,
    payg_amount,
    payg_purchases,
    model_id,
    feature,
    input_tokens,
    cost_usd,
    status,
    metadata,
    expires_at
  )
  values (
    p_ws_id,
    p_user_id,
    v_balance.id,
    v_credits,
    v_included_to_consume,
    v_payg_consumed,
    v_payg_purchases,
    p_model_id,
    p_feature,
    p_input_tokens,
    v_cost_usd,
    'reserved',
    coalesce(p_metadata, '{}'::jsonb),
    now() + make_interval(secs => greatest(coalesce(p_expires_in_seconds, 1800), 60))
  )
  returning id into v_reservation_id;

  v_payg_remaining := public._get_active_payg_credits(p_ws_id);
  v_remaining := (v_balance.total_allocated + v_balance.bonus_credits - v_new_total_used)
    + coalesce(v_payg_remaining, 0);

  return query
  select true, v_reservation_id, v_credits, v_cost_usd, v_remaining, null::text;
end;
$$;

create or replace function public.commit_metered_embedding_credits(
  p_reservation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  credits_deducted numeric,
  remaining_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_reservation record;
  v_payg_remaining numeric;
  v_remaining numeric;
begin
  select r.*, b.total_allocated, b.total_used, b.bonus_credits
  into v_reservation
  from private.ai_embedding_credit_reservations r
  join public.workspace_ai_credit_balances b on b.id = r.balance_id
  where r.id = p_reservation_id
  for update of r, b;

  if not found then
    return query select false, 0::numeric, 0::numeric, 'RESERVATION_NOT_FOUND'::text;
    return;
  end if;

  if v_reservation.status = 'committed' then
    v_payg_remaining := public._get_active_payg_credits(v_reservation.ws_id);
    v_remaining := (v_reservation.total_allocated + v_reservation.bonus_credits - v_reservation.total_used)
      + coalesce(v_payg_remaining, 0);
    return query select true, v_reservation.amount, v_remaining, null::text;
    return;
  end if;

  if v_reservation.status <> 'reserved' then
    return query select false, 0::numeric, 0::numeric, 'RESERVATION_NOT_ACTIVE'::text;
    return;
  end if;

  if v_reservation.expires_at <= now() then
    perform public._release_expired_embedding_credit_reservations(v_reservation.balance_id);
    return query select false, 0::numeric, 0::numeric, 'RESERVATION_EXPIRED'::text;
    return;
  end if;

  update private.ai_embedding_credit_reservations
  set status = 'committed',
      committed_at = now(),
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where id = p_reservation_id;

  insert into public.ai_credit_transactions (
    ws_id,
    user_id,
    balance_id,
    transaction_type,
    amount,
    cost_usd,
    model_id,
    feature,
    input_tokens,
    output_tokens,
    reasoning_tokens,
    metadata
  )
  values (
    case when v_reservation.ws_id is not null then v_reservation.ws_id else null end,
    v_reservation.user_id,
    v_reservation.balance_id,
    'deduction',
    -v_reservation.amount,
    v_reservation.cost_usd,
    v_reservation.model_id,
    v_reservation.feature,
    v_reservation.input_tokens,
    0,
    0,
    coalesce(v_reservation.metadata, '{}'::jsonb)
      || coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'reservation_id', v_reservation.id,
        'credit_split', jsonb_build_object(
          'included', v_reservation.included_amount,
          'payg', v_reservation.payg_amount
        )
      )
  );

  v_payg_remaining := public._get_active_payg_credits(v_reservation.ws_id);
  v_remaining := (v_reservation.total_allocated + v_reservation.bonus_credits - v_reservation.total_used)
    + coalesce(v_payg_remaining, 0);

  return query select true, v_reservation.amount, v_remaining, null::text;
end;
$$;

create or replace function public.release_metered_embedding_credits(
  p_reservation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  remaining_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_reservation record;
  v_purchase jsonb;
  v_total_used numeric;
  v_total_allocated numeric;
  v_bonus_credits numeric;
  v_payg_remaining numeric;
  v_remaining numeric;
begin
  select r.*, b.total_allocated, b.total_used, b.bonus_credits
  into v_reservation
  from private.ai_embedding_credit_reservations r
  join public.workspace_ai_credit_balances b on b.id = r.balance_id
  where r.id = p_reservation_id
  for update of r, b;

  if not found then
    return query select false, 0::numeric, 'RESERVATION_NOT_FOUND'::text;
    return;
  end if;

  if v_reservation.status = 'committed' then
    return query select false, 0::numeric, 'RESERVATION_ALREADY_COMMITTED'::text;
    return;
  end if;

  if v_reservation.status in ('released', 'expired') then
    v_payg_remaining := public._get_active_payg_credits(v_reservation.ws_id);
    v_remaining := (v_reservation.total_allocated + v_reservation.bonus_credits - v_reservation.total_used)
      + coalesce(v_payg_remaining, 0);
    return query select true, v_remaining, null::text;
    return;
  end if;

  if v_reservation.included_amount > 0 then
    update public.workspace_ai_credit_balances
    set total_used = greatest(total_used - v_reservation.included_amount, 0),
        updated_at = now()
    where id = v_reservation.balance_id
    returning total_used, total_allocated, bonus_credits
    into v_total_used, v_total_allocated, v_bonus_credits;
  else
    v_total_used := v_reservation.total_used;
    v_total_allocated := v_reservation.total_allocated;
    v_bonus_credits := v_reservation.bonus_credits;
  end if;

  for v_purchase in
    select * from jsonb_array_elements(coalesce(v_reservation.payg_purchases, '[]'::jsonb))
  loop
    update public.workspace_credit_pack_purchases
    set tokens_remaining = tokens_remaining + coalesce((v_purchase ->> 'amount')::numeric, 0),
        status = 'active',
        updated_at = now()
    where id = (v_purchase ->> 'id')::uuid;
  end loop;

  update private.ai_embedding_credit_reservations
  set status = 'released',
      released_at = now(),
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where id = p_reservation_id;

  v_payg_remaining := public._get_active_payg_credits(v_reservation.ws_id);
  v_remaining := (v_total_allocated + v_bonus_credits - v_total_used)
    + coalesce(v_payg_remaining, 0);

  return query select true, v_remaining, null::text;
end;
$$;

revoke execute on function public.reserve_metered_embedding_credits(
  uuid,
  uuid,
  text,
  integer,
  text,
  jsonb,
  integer
) from public, anon, authenticated;

revoke execute on function public.commit_metered_embedding_credits(
  uuid,
  jsonb
) from public, anon, authenticated;

revoke execute on function public.release_metered_embedding_credits(
  uuid,
  jsonb
) from public, anon, authenticated;

revoke execute on function public._release_expired_embedding_credit_reservations(
  uuid
) from public, anon, authenticated;

grant execute on function public.reserve_metered_embedding_credits(
  uuid,
  uuid,
  text,
  integer,
  text,
  jsonb,
  integer
) to service_role;

grant execute on function public.commit_metered_embedding_credits(
  uuid,
  jsonb
) to service_role;

grant execute on function public.release_metered_embedding_credits(
  uuid,
  jsonb
) to service_role;

grant execute on function public._release_expired_embedding_credit_reservations(
  uuid
) to service_role;
