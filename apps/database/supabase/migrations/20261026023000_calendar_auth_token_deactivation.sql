-- Quarantine permanently rejected calendar OAuth credentials without deleting
-- them, so the owner can reconnect the same row. Table RLS and grants are unchanged.
alter table public.calendar_auth_tokens
  add column deactivated_reason text,
  add column deactivated_at timestamptz;

alter table public.calendar_auth_tokens
  add constraint calendar_auth_tokens_deactivated_reason_check check (
    deactivated_reason is null
    or deactivated_reason in (
      'google_invalid_grant',
      'google_unauthorized_client',
      'google_access_revoked',
      'microsoft_invalid_grant',
      'microsoft_consent_revoked',
      'microsoft_unauthorized_client',
      'unknown_permanent'
    )
  ) not valid,
  add constraint calendar_auth_tokens_deactivation_pair_check check (
    (deactivated_reason is null) = (deactivated_at is null)
  ) not valid,
  add constraint calendar_auth_tokens_active_not_deactivated_check check (
    not is_active or deactivated_reason is null
  ) not valid;

alter table public.calendar_auth_tokens
  validate constraint calendar_auth_tokens_deactivated_reason_check;
alter table public.calendar_auth_tokens
  validate constraint calendar_auth_tokens_deactivation_pair_check;
alter table public.calendar_auth_tokens
  validate constraint calendar_auth_tokens_active_not_deactivated_check;

-- Any reactivation path, including a rolled-back callback that only sets
-- is_active, clears the quarantine fields instead of violating the checks.
create function private.calendar_auth_tokens_clear_deactivation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.deactivated_reason := null;
  new.deactivated_at := null;
  return new;
end;
$$;

revoke all on function private.calendar_auth_tokens_clear_deactivation()
  from public, anon, authenticated, service_role;

create trigger calendar_auth_tokens_clear_deactivation
before insert or update on public.calendar_auth_tokens
for each row
when (
  new.is_active
  and (new.deactivated_reason is not null or new.deactivated_at is not null)
)
execute function private.calendar_auth_tokens_clear_deactivation();

-- Fenced, idempotent quarantine. Callers send sha256(refresh_token) and the
-- created_at they read; a concurrent reconnect rewrites created_at (and usually
-- the refresh token), so the update matches nothing and returns 'fenced'.
create function public.quarantine_calendar_auth_token(
  p_token_id uuid,
  p_ws_id uuid,
  p_credential_fingerprint text,
  p_observed_created_at timestamptz,
  p_reason text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_active boolean;
begin
  update public.calendar_auth_tokens as token
  set is_active = false,
      deactivated_reason = p_reason,
      deactivated_at = pg_catalog.now()
  where token.id = p_token_id
    and token.ws_id = p_ws_id
    and token.is_active
    and token.created_at = p_observed_created_at
    and pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(token.refresh_token, 'UTF8')),
      'hex'
    ) = p_credential_fingerprint;

  if found then
    return 'deactivated';
  end if;

  select token.is_active
  into current_active
  from public.calendar_auth_tokens as token
  where token.id = p_token_id
    and token.ws_id = p_ws_id;

  if current_active is false then
    return 'already_inactive';
  end if;

  return 'fenced';
end;
$$;

revoke all on function public.quarantine_calendar_auth_token(uuid, uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.quarantine_calendar_auth_token(uuid, uuid, text, timestamptz, text)
  to service_role;
