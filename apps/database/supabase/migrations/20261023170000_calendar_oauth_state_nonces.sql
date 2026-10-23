-- Single-use ledger for Calendar provider OAuth `state` nonces.
--
-- The Calendar app signs each OAuth state (user, workspace, expiry, nonce).
-- The callback consumes the nonce here exactly once before exchanging the
-- authorization code, so a replayed state is rejected even with a fresh code.
-- Rows are server-only: RLS is enabled with no client policies and only the
-- service role can execute the consume RPC.

create table if not exists private.calendar_oauth_state_nonces (
  nonce text primary key,
  provider text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now(),
  constraint calendar_oauth_state_nonces_nonce_check
    check (char_length(nonce) between 16 and 64),
  constraint calendar_oauth_state_nonces_provider_check
    check (provider in ('google', 'microsoft'))
);

create index if not exists calendar_oauth_state_nonces_expires_at_idx
  on private.calendar_oauth_state_nonces (expires_at);

alter table private.calendar_oauth_state_nonces enable row level security;
alter table private.calendar_oauth_state_nonces force row level security;

revoke all on table private.calendar_oauth_state_nonces from public;
revoke all on table private.calendar_oauth_state_nonces from anon, authenticated;
revoke all on table private.calendar_oauth_state_nonces from service_role;

-- Returns true when this call consumed the nonce, false when it was already
-- used. Invalid input raises so the caller fails closed.
create or replace function private.consume_calendar_oauth_state_nonce(
  p_nonce text,
  p_provider text,
  p_user_id uuid,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_nonce is null or char_length(p_nonce) not between 16 and 64 then
    raise exception 'invalid calendar oauth nonce' using errcode = '22023';
  end if;

  if p_provider is null or p_provider not in ('google', 'microsoft') then
    raise exception 'invalid calendar oauth provider' using errcode = '22023';
  end if;

  if p_user_id is null then
    raise exception 'invalid calendar oauth user' using errcode = '22023';
  end if;

  -- States live for 10 minutes; reject expired or implausibly long-lived ones.
  if p_expires_at is null
    or p_expires_at <= now()
    or p_expires_at > now() + interval '15 minutes' then
    raise exception 'invalid calendar oauth expiry' using errcode = '22023';
  end if;

  -- Opportunistic, bounded purge. Only rows past their expiry plus a grace
  -- window are removed, so a purged nonce always belongs to a state the app
  -- already rejects as expired, even with modest clock skew.
  delete from private.calendar_oauth_state_nonces
  where nonce in (
    select stale.nonce
    from private.calendar_oauth_state_nonces as stale
    where stale.expires_at < now() - interval '1 hour'
    order by stale.expires_at
    limit 100
  );

  insert into private.calendar_oauth_state_nonces (
    nonce,
    provider,
    user_id,
    expires_at
  )
  values (p_nonce, p_provider, p_user_id, p_expires_at)
  on conflict (nonce) do nothing;

  -- FOUND is true only when this INSERT wrote the row.
  return found;
end;
$$;

revoke execute on function private.consume_calendar_oauth_state_nonce(text, text, uuid, timestamptz) from public;
revoke execute on function private.consume_calendar_oauth_state_nonce(text, text, uuid, timestamptz) from anon, authenticated;
grant execute on function private.consume_calendar_oauth_state_nonce(text, text, uuid, timestamptz) to service_role;
