alter table private.auth_recovery_tokens
  add column if not exists code_failed_attempts integer not null default 0,
  add column if not exists code_last_failed_at timestamptz,
  add column if not exists code_last_failed_ip_hash text,
  add column if not exists code_last_failed_user_agent_hash text,
  add column if not exists code_locked_at timestamptz,
  add column if not exists code_locked_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'auth_recovery_tokens_code_failed_attempts_check'
      and conrelid = 'private.auth_recovery_tokens'::regclass
  ) then
    alter table private.auth_recovery_tokens
      add constraint auth_recovery_tokens_code_failed_attempts_check
      check (code_failed_attempts >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'auth_recovery_tokens_code_locked_reason_check'
      and conrelid = 'private.auth_recovery_tokens'::regclass
  ) then
    alter table private.auth_recovery_tokens
      add constraint auth_recovery_tokens_code_locked_reason_check
      check (
        code_locked_reason is null
        or char_length(btrim(code_locked_reason)) between 1 and 100
      );
  end if;
end $$;

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
  v_code_attempt_limit integer := 5;
  v_code_candidate record;
begin
  if p_token_hash is null and (p_email is null or p_code_hash is null) then
    return;
  end if;

  v_consumed_by := case when p_token_hash is not null then 'token' else 'code' end;

  if p_token_hash is null then
    select
      token_row.id,
      token_row.override_id,
      token_row.email,
      token_row.code_hash,
      token_row.code_failed_attempts,
      token_row.code_locked_at
    into v_code_candidate
    from private.auth_recovery_tokens as token_row
    join private.auth_recovery_overrides as override_row
      on override_row.id = token_row.override_id
    where token_row.consumed_at is null
      and token_row.expires_at > v_now
      and override_row.revoked_at is null
      and override_row.expires_at > v_now
      and override_row.allow_recovery_email = true
      and token_row.email = lower(btrim(p_email))
    order by token_row.created_at desc
    limit 1
    for update of token_row skip locked;

    if not found then
      return;
    end if;

    if v_code_candidate.code_locked_at is not null
      or v_code_candidate.code_failed_attempts >= v_code_attempt_limit then
      return;
    end if;

    if v_code_candidate.code_hash <> p_code_hash then
      update private.auth_recovery_tokens as token_row
      set
        code_failed_attempts = token_row.code_failed_attempts + 1,
        code_last_failed_at = v_now,
        code_last_failed_ip_hash = p_ip_hash,
        code_last_failed_user_agent_hash = p_user_agent_hash,
        code_locked_at = case
          when token_row.code_failed_attempts + 1 >= v_code_attempt_limit
            then coalesce(token_row.code_locked_at, v_now)
          else token_row.code_locked_at
        end,
        code_locked_reason = case
          when token_row.code_failed_attempts + 1 >= v_code_attempt_limit
            then 'too_many_code_attempts'
          else token_row.code_locked_reason
        end
      where token_row.id = v_code_candidate.id;

      return;
    end if;

    return query
    with consumed as (
      update private.auth_recovery_tokens as token_row
      set
        consumed_at = v_now,
        consumed_ip_hash = p_ip_hash,
        consumed_user_agent_hash = p_user_agent_hash
      where token_row.id = v_code_candidate.id
        and token_row.code_locked_at is null
        and token_row.code_failed_attempts < v_code_attempt_limit
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

    return;
  end if;

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
      and token_row.token_hash = p_token_hash
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

revoke execute on function private.consume_auth_recovery_credential(text, text, text, text, text) from public;
revoke execute on function private.consume_auth_recovery_credential(text, text, text, text, text) from anon, authenticated;
grant execute on function private.consume_auth_recovery_credential(text, text, text, text, text) to service_role;
