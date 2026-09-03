create table private.discord_interaction_claims (
  interaction_id text primary key,
  interaction_type smallint not null,
  claim_token uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default clock_timestamp(),
  lease_expires_at timestamptz not null,
  completed_at timestamptz,
  response_payload jsonb,
  expires_at timestamptz not null,
  constraint discord_interaction_claims_id_valid
    check (interaction_id ~ '^[0-9]{1,32}$'),
  constraint discord_interaction_claims_type_valid
    check (interaction_type in (2, 3, 5)),
  constraint discord_interaction_claims_expiry_valid
    check (expires_at > claimed_at),
  constraint discord_interaction_claims_lease_valid
    check (lease_expires_at > claimed_at and lease_expires_at <= expires_at),
  constraint discord_interaction_claims_completion_valid
    check ((completed_at is null) = (response_payload is null))
);

alter table private.discord_interaction_claims enable row level security;
alter table private.discord_interaction_claims force row level security;

create index discord_interaction_claims_expires_at_idx
  on private.discord_interaction_claims (expires_at);

revoke all on table private.discord_interaction_claims from public, anon, authenticated;
grant select, insert, update, delete on table private.discord_interaction_claims to service_role;

create or replace function private.claim_discord_interaction(
  p_interaction_id text,
  p_interaction_type smallint,
  p_retention_seconds integer default 86400
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claimed boolean;
  v_claim_token uuid;
  v_existing private.discord_interaction_claims%rowtype;
begin
  if p_interaction_id is null
    or p_interaction_id !~ '^[0-9]{1,32}$'
    or p_interaction_type not in (2, 3, 5)
    or p_retention_seconds < 300
    or p_retention_seconds > 604800
  then
    raise exception 'invalid Discord interaction claim';
  end if;

  delete from private.discord_interaction_claims
  where interaction_id in (
    select interaction_id
    from private.discord_interaction_claims
    where expires_at <= clock_timestamp()
    order by expires_at
    limit 100
  );

  loop
    v_claimed := false;
    v_claim_token := null;

    insert into private.discord_interaction_claims (
      interaction_id,
      interaction_type,
      lease_expires_at,
      expires_at
    )
    values (
      p_interaction_id,
      p_interaction_type,
      clock_timestamp() + interval '1 minute',
      clock_timestamp() + make_interval(secs => p_retention_seconds)
    )
    on conflict (interaction_id) do nothing
    returning true, claim_token into v_claimed, v_claim_token;

    if coalesce(v_claimed, false) then
      return jsonb_build_object(
        'state', 'claimed',
        'claimToken', v_claim_token
      );
    end if;

    select * into v_existing
    from private.discord_interaction_claims
    where interaction_id = p_interaction_id
    for update;

    if not found then
      continue;
    end if;

    if v_existing.response_payload is not null then
      return jsonb_build_object(
        'state', 'completed',
        'response', v_existing.response_payload
      );
    end if;

    update private.discord_interaction_claims
    set
      interaction_type = p_interaction_type,
      claim_token = gen_random_uuid(),
      claimed_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + interval '1 minute',
      expires_at = clock_timestamp() + make_interval(secs => p_retention_seconds)
    where interaction_id = p_interaction_id
      and response_payload is null
      and lease_expires_at <= clock_timestamp()
    returning claim_token into v_claim_token;

    if v_claim_token is not null then
      return jsonb_build_object(
        'state', 'claimed',
        'claimToken', v_claim_token
      );
    end if;

    return jsonb_build_object('state', 'processing');
  end loop;
end;
$$;

revoke all on function private.claim_discord_interaction(text, smallint, integer)
  from public, anon, authenticated;
grant execute on function private.claim_discord_interaction(text, smallint, integer)
  to service_role;

create or replace function private.complete_discord_interaction(
  p_interaction_id text,
  p_interaction_type smallint,
  p_claim_token uuid,
  p_response_payload jsonb
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  update private.discord_interaction_claims
  set
    completed_at = clock_timestamp(),
    response_payload = p_response_payload,
    lease_expires_at = expires_at
  where interaction_id = p_interaction_id
    and interaction_type = p_interaction_type
    and claim_token = p_claim_token
    and response_payload is null
  returning true;
$$;

create or replace function private.release_discord_interaction(
  p_interaction_id text,
  p_interaction_type smallint,
  p_claim_token uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from private.discord_interaction_claims
  where interaction_id = p_interaction_id
    and interaction_type = p_interaction_type
    and claim_token = p_claim_token
    and response_payload is null;
$$;

revoke all on function private.complete_discord_interaction(text, smallint, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.complete_discord_interaction(text, smallint, uuid, jsonb)
  to service_role;
revoke all on function private.release_discord_interaction(text, smallint, uuid)
  from public, anon, authenticated;
grant execute on function private.release_discord_interaction(text, smallint, uuid)
  to service_role;

create or replace function private.prune_discord_interaction_claims(
  p_limit integer default 1000
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'invalid Discord interaction prune limit';
  end if;

  with expired as (
    select interaction_id
    from private.discord_interaction_claims
    where expires_at <= clock_timestamp()
    order by expires_at
    limit p_limit
  ), deleted as (
    delete from private.discord_interaction_claims claims
    using expired
    where claims.interaction_id = expired.interaction_id
    returning 1
  )
  select count(*) into v_deleted from deleted;

  return v_deleted;
end;
$$;

revoke all on function private.prune_discord_interaction_claims(integer)
  from public, anon, authenticated;
grant execute on function private.prune_discord_interaction_claims(integer)
  to service_role;
