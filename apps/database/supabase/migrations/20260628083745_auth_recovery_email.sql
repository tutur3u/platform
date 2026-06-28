create schema if not exists private;

create table if not exists private.auth_recovery_overrides (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reason text not null,
  allow_normal_login boolean not null default true,
  allow_recovery_email boolean not null default true,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on update cascade on delete set null,
  revoke_reason text,
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint auth_recovery_overrides_email_normalized_check
    check (email = lower(btrim(email)) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint auth_recovery_overrides_reason_check
    check (char_length(btrim(reason)) between 1 and 1000),
  constraint auth_recovery_overrides_expiry_check
    check (expires_at > created_at),
  constraint auth_recovery_overrides_revoke_reason_check
    check (revoke_reason is null or char_length(btrim(revoke_reason)) <= 1000),
  constraint auth_recovery_overrides_mode_check
    check (allow_normal_login or allow_recovery_email)
);

create unique index if not exists auth_recovery_overrides_unrevoked_email_idx
  on private.auth_recovery_overrides (email)
  where revoked_at is null;

create index if not exists auth_recovery_overrides_expires_at_idx
  on private.auth_recovery_overrides (expires_at desc);

create trigger update_auth_recovery_overrides_updated_at
  before update on private.auth_recovery_overrides
  for each row
  execute function public.update_updated_at_column();

create table if not exists private.auth_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  override_id uuid not null references private.auth_recovery_overrides(id) on update cascade on delete cascade,
  email text not null,
  token_hash text not null,
  code_hash text not null,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  email_audit_id uuid references public.email_audit(id) on update cascade on delete set null,
  consumed_at timestamptz,
  consumed_ip_hash text,
  consumed_user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  constraint auth_recovery_tokens_email_normalized_check
    check (email = lower(btrim(email)) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint auth_recovery_tokens_token_hash_check
    check (char_length(token_hash) = 64),
  constraint auth_recovery_tokens_code_hash_check
    check (char_length(code_hash) = 64),
  constraint auth_recovery_tokens_expiry_check
    check (expires_at > created_at)
);

create unique index if not exists auth_recovery_tokens_token_hash_idx
  on private.auth_recovery_tokens (token_hash);

create index if not exists auth_recovery_tokens_code_lookup_idx
  on private.auth_recovery_tokens (email, code_hash)
  where consumed_at is null;

create index if not exists auth_recovery_tokens_override_created_idx
  on private.auth_recovery_tokens (override_id, created_at desc);

create table if not exists private.auth_recovery_events (
  id uuid primary key default gen_random_uuid(),
  override_id uuid references private.auth_recovery_overrides(id) on update cascade on delete set null,
  token_id uuid references private.auth_recovery_tokens(id) on update cascade on delete set null,
  email text not null,
  event_type text not null,
  actor_user_id uuid references public.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint auth_recovery_events_email_normalized_check
    check (email = lower(btrim(email)) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint auth_recovery_events_type_check
    check (
      event_type in (
        'override_created',
        'override_revoked',
        'normal_login_bypass_used',
        'recovery_email_sent',
        'recovery_email_send_failed',
        'recovery_token_consumed',
        'recovery_code_consumed',
        'recovery_token_rejected',
        'supabase_user_created',
        'supabase_user_unbanned'
      )
    )
);

create index if not exists auth_recovery_events_email_created_idx
  on private.auth_recovery_events (email, created_at desc);

create index if not exists auth_recovery_events_override_created_idx
  on private.auth_recovery_events (override_id, created_at desc);

alter table private.auth_recovery_overrides enable row level security;
alter table private.auth_recovery_tokens enable row level security;
alter table private.auth_recovery_events enable row level security;

create policy "Service role can manage auth recovery overrides"
  on private.auth_recovery_overrides
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage auth recovery tokens"
  on private.auth_recovery_tokens
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage auth recovery events"
  on private.auth_recovery_events
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table private.auth_recovery_overrides from anon, authenticated;
revoke all on table private.auth_recovery_tokens from anon, authenticated;
revoke all on table private.auth_recovery_events from anon, authenticated;

grant select, insert, update, delete on table private.auth_recovery_overrides to service_role;
grant select, insert, update, delete on table private.auth_recovery_tokens to service_role;
grant select, insert, update, delete on table private.auth_recovery_events to service_role;

create or replace function private.get_active_auth_recovery_override(p_email text)
returns table (
  id uuid,
  email text,
  allow_normal_login boolean,
  allow_recovery_email boolean,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  last_used_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    override_row.id,
    override_row.email,
    override_row.allow_normal_login,
    override_row.allow_recovery_email,
    override_row.expires_at,
    override_row.created_by,
    override_row.created_at,
    override_row.last_used_at
  from private.auth_recovery_overrides as override_row
  where override_row.email = lower(btrim(p_email))
    and override_row.revoked_at is null
    and override_row.expires_at > now()
  order by override_row.created_at desc
  limit 1;
$$;

create or replace function private.consume_auth_recovery_credential(
  p_token_hash text default null,
  p_email text default null,
  p_code_hash text default null,
  p_ip_hash text default null,
  p_user_agent_hash text default null
)
returns table (
  token_id uuid,
  override_id uuid,
  email text,
  consumed_by text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_consumed_by text;
begin
  if p_token_hash is null and (p_email is null or p_code_hash is null) then
    return;
  end if;

  v_consumed_by := case when p_token_hash is not null then 'token' else 'code' end;

  return query
  with candidate as (
    select token_row.id
    from private.auth_recovery_tokens as token_row
    join private.auth_recovery_overrides as override_row
      on override_row.id = token_row.override_id
    where token_row.consumed_at is null
      and token_row.expires_at > v_now
      and override_row.revoked_at is null
      and override_row.expires_at > v_now
      and override_row.allow_recovery_email = true
      and (
        (p_token_hash is not null and token_row.token_hash = p_token_hash)
        or (
          p_token_hash is null
          and token_row.email = lower(btrim(p_email))
          and token_row.code_hash = p_code_hash
        )
      )
    order by token_row.created_at desc
    limit 1
    for update skip locked
  ),
  consumed as (
    update private.auth_recovery_tokens as token_row
    set
      consumed_at = v_now,
      consumed_ip_hash = p_ip_hash,
      consumed_user_agent_hash = p_user_agent_hash
    from candidate
    where token_row.id = candidate.id
    returning token_row.id, token_row.override_id, token_row.email
  ),
  touched_override as (
    update private.auth_recovery_overrides as override_row
    set last_used_at = v_now
    from consumed
    where override_row.id = consumed.override_id
    returning override_row.id
  )
  select
    consumed.id,
    consumed.override_id,
    consumed.email,
    v_consumed_by
  from consumed
  join touched_override on touched_override.id = consumed.override_id;
end;
$$;

revoke execute on function private.get_active_auth_recovery_override(text) from public;
revoke execute on function private.consume_auth_recovery_credential(text, text, text, text, text) from public;
revoke execute on function private.get_active_auth_recovery_override(text) from anon, authenticated;
revoke execute on function private.consume_auth_recovery_credential(text, text, text, text, text) from anon, authenticated;

grant execute on function private.get_active_auth_recovery_override(text) to service_role;
grant execute on function private.consume_auth_recovery_credential(text, text, text, text, text) to service_role;
