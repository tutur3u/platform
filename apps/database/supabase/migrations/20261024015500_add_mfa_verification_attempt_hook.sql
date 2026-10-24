-- Per-account MFA verification limit enforced by Supabase Auth.
--
-- API routes already limit MFA verification per IP and per account, but a
-- client holding a session can call Auth's MFA endpoints directly. This hook
-- applies the same per-factor and per-account failure budget inside Auth for
-- every caller. It is inert until enabled as the "MFA verification attempt"
-- hook (local: config.toml; hosted: Authentication > Hooks, plan permitting).
-- See apps/docs/build/devops/adaptive-abuse-rate-limits.mdx.

create table if not exists private.mfa_verification_failures (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null,
  window_started_at timestamptz not null default now(),
  failed_count integer not null default 0 check (failed_count >= 0),
  primary key (user_id, scope_key)
);

alter table private.mfa_verification_failures enable row level security;

revoke all on table private.mfa_verification_failures
  from public, anon, authenticated;

grant all on table private.mfa_verification_failures to service_role;

comment on table private.mfa_verification_failures is
  'Windowed MFA verification failure counters per account (scope_key = user) and per factor (scope_key = factor:<id>).';

create or replace function public.hook_mfa_verification_attempt(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_factor_window constant interval := interval '15 minutes';
  v_factor_max constant integer := 5;
  v_user_window constant interval := interval '1 hour';
  v_user_max constant integer := 10;
  v_user_id uuid;
  v_factor_key text;
  v_valid boolean;
  v_factor_failures integer;
  v_user_failures integer;
begin
  begin
    v_user_id := (event ->> 'user_id')::uuid;
    v_factor_key := 'factor:' || ((event ->> 'factor_id')::uuid)::text;
  exception
    when invalid_text_representation then
      return jsonb_build_object('decision', 'continue');
  end;

  if v_user_id is null or v_factor_key is null then
    return jsonb_build_object('decision', 'continue');
  end if;

  v_valid := coalesce((event ->> 'valid')::boolean, false);

  -- Serialize attempts for one account so concurrent guesses share a budget.
  perform pg_advisory_xact_lock(
    hashtextextended('mfa_verification_attempt:' || v_user_id::text, 0)
  );

  select
    coalesce(max(f.failed_count) filter (
      where f.scope_key = v_factor_key
        and f.window_started_at > now() - v_factor_window
    ), 0),
    coalesce(max(f.failed_count) filter (
      where f.scope_key = 'user'
        and f.window_started_at > now() - v_user_window
    ), 0)
  into v_factor_failures, v_user_failures
  from private.mfa_verification_failures as f
  where f.user_id = v_user_id
    and f.scope_key in (v_factor_key, 'user');

  -- While the budget is spent, even a correct code is refused.
  if v_factor_failures >= v_factor_max or v_user_failures >= v_user_max then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 429,
        'message', 'Too many failed verification attempts. Please wait before trying again.'
      )
    );
  end if;

  if v_valid then
    delete from private.mfa_verification_failures
    where user_id = v_user_id
      and scope_key in (v_factor_key, 'user');

    return jsonb_build_object('decision', 'continue');
  end if;

  insert into private.mfa_verification_failures as f (
    user_id,
    scope_key,
    window_started_at,
    failed_count
  )
  values
    (v_user_id, v_factor_key, now(), 1),
    (v_user_id, 'user', now(), 1)
  on conflict (user_id, scope_key) do update
  set
    failed_count = case
      when f.window_started_at > now() - case
        when f.scope_key = 'user' then v_user_window
        else v_factor_window
      end
      then f.failed_count + 1
      else 1
    end,
    window_started_at = case
      when f.window_started_at > now() - case
        when f.scope_key = 'user' then v_user_window
        else v_factor_window
      end
      then f.window_started_at
      else now()
    end;

  return jsonb_build_object('decision', 'continue');
end;
$$;

comment on function public.hook_mfa_verification_attempt(jsonb) is
  'Supabase Auth MFA verification attempt hook: per-factor and per-account failure budget. Executable by supabase_auth_admin only.';

-- Only Auth may run the hook: the service role would otherwise be able to spend
-- any account's budget over RPC.
revoke all on function public.hook_mfa_verification_attempt(jsonb)
  from public, anon, authenticated, service_role;

-- Auth needs schema lookup permission as well as function execution permission.
grant usage on schema public to supabase_auth_admin;

grant execute on function public.hook_mfa_verification_attempt(jsonb)
  to supabase_auth_admin;
