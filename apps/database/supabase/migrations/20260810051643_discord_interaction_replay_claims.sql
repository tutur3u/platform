create table private.discord_interaction_claims (
  interaction_id text primary key,
  interaction_type smallint not null,
  claimed_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  constraint discord_interaction_claims_id_valid
    check (interaction_id ~ '^[0-9]{1,32}$'),
  constraint discord_interaction_claims_type_valid
    check (interaction_type in (1, 2, 3, 5)),
  constraint discord_interaction_claims_expiry_valid
    check (expires_at > claimed_at)
);

alter table private.discord_interaction_claims enable row level security;
alter table private.discord_interaction_claims force row level security;

create index discord_interaction_claims_expires_at_idx
  on private.discord_interaction_claims (expires_at);

revoke all on table private.discord_interaction_claims from public, anon, authenticated;
grant select, insert, delete on table private.discord_interaction_claims to service_role;

create or replace function private.claim_discord_interaction(
  p_interaction_id text,
  p_interaction_type smallint,
  p_retention_seconds integer default 86400
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  if p_interaction_id is null
    or p_interaction_id !~ '^[0-9]{1,32}$'
    or p_interaction_type not in (1, 2, 3, 5)
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

  insert into private.discord_interaction_claims (
    interaction_id,
    interaction_type,
    expires_at
  )
  values (
    p_interaction_id,
    p_interaction_type,
    clock_timestamp() + make_interval(secs => p_retention_seconds)
  )
  on conflict (interaction_id) do nothing
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function private.claim_discord_interaction(text, smallint, integer)
  from public, anon, authenticated;
grant execute on function private.claim_discord_interaction(text, smallint, integer)
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
  if p_limit < 1 or p_limit > 10000 then
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
