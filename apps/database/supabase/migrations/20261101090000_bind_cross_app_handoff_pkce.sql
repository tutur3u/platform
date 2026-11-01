-- Bind cross-app login handoff tokens to the browser that started the login
-- (security finding M1). A client may send an RFC 7636 S256 code_challenge with
-- the login redirect; the token then redeems only with the matching
-- code_verifier, so an intercepted token is useless on its own.
--
-- * private.cross_app_tokens stores the optional challenge.
-- * generate_cross_app_token_pkce mints a token that stores it; the existing
--   generate_cross_app_token overloads are unchanged.
-- * Redemption moves into private.redeem_cross_app_token. The anonymous
--   validate_cross_app_token_with_session now refuses every challenge-bound
--   token, and validate_cross_app_token_with_session_pkce (service_role only)
--   requires the verifier.
-- * The PKCE variants use distinct names instead of overloads so the
--   generated Database['public']['Functions'] types stay shallow.
--   A verifier for a token minted without a challenge is refused (PKCE
--   downgrade guard, OAuth 2.1). A failed verification consumes nothing.

alter table private.cross_app_tokens
  add column if not exists code_challenge text,
  add column if not exists code_challenge_method text;

alter table private.cross_app_tokens
  drop constraint if exists cross_app_tokens_code_challenge_check;
alter table private.cross_app_tokens
  add constraint cross_app_tokens_code_challenge_check check (
    (code_challenge is null and code_challenge_method is null)
    or (
      code_challenge_method = 'S256'
      -- BASE64URL(SHA256(verifier)) without padding is always 43 characters.
      and code_challenge ~ '^[A-Za-z0-9_-]{43}$'
    )
  );

create or replace function public.generate_cross_app_token_pkce(
  p_user_id uuid,
  p_origin_app text,
  p_target_app text,
  p_expiry_seconds integer,
  p_session_data jsonb,
  p_code_challenge text,
  p_code_challenge_method text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_token text;
begin
  if p_code_challenge is null and p_code_challenge_method is null then
    return public.generate_cross_app_token(
      p_user_id,
      p_origin_app,
      p_target_app,
      p_expiry_seconds,
      p_session_data
    );
  end if;

  if p_code_challenge_method is distinct from 'S256'
    or p_code_challenge is null
    or p_code_challenge !~ '^[A-Za-z0-9_-]{43}$'
  then
    raise exception 'Invalid cross-app code challenge'
      using errcode = '22023';
  end if;

  -- The five-argument overload owns caller binding, app and lifetime bounds.
  v_token := public.generate_cross_app_token(
    p_user_id,
    p_origin_app,
    p_target_app,
    p_expiry_seconds,
    p_session_data
  );

  update private.cross_app_tokens t
  set code_challenge = p_code_challenge,
    code_challenge_method = 'S256'
  where t.token = v_token;

  return v_token;
end;
$$;

-- tuturuuu: no-grant (internal)
create or replace function private.redeem_cross_app_token(
  p_token text,
  p_target_app text,
  p_code_verifier text
)
returns table(user_id uuid, session_data jsonb)
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_record record;
  v_required_service public.platform_service;
  v_user_services public.platform_service[];
  v_computed_challenge text;
  v_compare_key bytea;
begin
  if p_code_verifier is not null
    and p_code_verifier !~ '^[A-Za-z0-9._~-]{43,128}$'
  then
    return query select null::uuid, null::jsonb;
    return;
  end if;

  select
    t.user_id,
    private.cross_app_verified_session_data(t.user_id, t.session_data)
      as session_data,
    t.origin_app,
    t.code_challenge,
    t.code_challenge_method
  into v_record
  from private.cross_app_tokens t
  where t.token = p_token
    and t.target_app = p_target_app
    and t.expires_at > now()
    and t.used_at is null
    and t.is_revoked = false
  for update of t;

  if v_record.user_id is null then
    return query select null::uuid, null::jsonb;
    return;
  end if;

  if v_record.code_challenge is null then
    if p_code_verifier is not null then
      return query select null::uuid, null::jsonb;
      return;
    end if;
  else
    if p_code_verifier is null
      or v_record.code_challenge_method is distinct from 'S256'
    then
      return query select null::uuid, null::jsonb;
      return;
    end if;

    v_computed_challenge := rtrim(
      translate(
        encode(pg_catalog.sha256(convert_to(p_code_verifier, 'UTF8')), 'base64'),
        '+/',
        '-_'
      ),
      '='
    );
    -- Compare keyed digests so comparison timing reveals nothing about the
    -- stored challenge.
    v_compare_key := extensions.gen_random_bytes(32);
    if extensions.hmac(
        convert_to(v_computed_challenge, 'UTF8'),
        v_compare_key,
        'sha256'
      ) <> extensions.hmac(
        convert_to(v_record.code_challenge, 'UTF8'),
        v_compare_key,
        'sha256'
      )
    then
      return query select null::uuid, null::jsonb;
      return;
    end if;
  end if;

  if v_record.origin_app = 'web' then
    case p_target_app
      when 'platform' then v_required_service := 'TUTURUUU';
      when 'rewise' then v_required_service := 'REWISE';
      when 'nova' then v_required_service := 'NOVA';
      when 'upskii' then v_required_service := 'UPSKII';
      else v_required_service := null;
    end case;

    select coalesce(private_details.services, '{}'::public.platform_service[])
    into v_user_services
    from public.user_private_details private_details
    where private_details.user_id = v_record.user_id;

    if v_required_service is not null
      and not (
        v_required_service = any(
          coalesce(v_user_services, '{}'::public.platform_service[])
        )
      )
    then
      update public.user_private_details private_details
      set services = array_append(
        coalesce(private_details.services, '{}'::public.platform_service[]),
        v_required_service
      )
      where private_details.user_id = v_record.user_id;
    end if;
  end if;

  update private.cross_app_tokens t
  set used_at = now()
  where t.token = p_token;

  return query select v_record.user_id, v_record.session_data;
end;
$$;

-- allow-definer-public: pre-session bearer redemption (anon EXECUTE by design).
create or replace function public.validate_cross_app_token_with_session(
  p_token text,
  p_target_app text
)
returns table(user_id uuid, session_data jsonb)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  -- No verifier: challenge-bound tokens never redeem through this function.
  return query
  select r.user_id, r.session_data
  from private.redeem_cross_app_token(p_token, p_target_app, null) r;
end;
$$;

create or replace function public.validate_cross_app_token_with_session_pkce(
  p_token text,
  p_target_app text,
  p_code_verifier text
)
returns table(user_id uuid, session_data jsonb)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  return query
  select r.user_id, r.session_data
  from private.redeem_cross_app_token(p_token, p_target_app, p_code_verifier) r;
end;
$$;

revoke all on function private.redeem_cross_app_token(text, text, text)
  from public, anon, authenticated, service_role;

revoke all on function public.generate_cross_app_token_pkce(uuid, text, text, integer, jsonb, text, text)
  from public, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.generate_cross_app_token_pkce(uuid,text,text,integer,jsonb,text,text) review=SR-M1-pkce-handoff
grant execute on function public.generate_cross_app_token_pkce(uuid, text, text, integer, jsonb, text, text)
  to authenticated;

-- Redemption authenticates possession of the one-time bearer token; tokens
-- minted with a code challenge also need the verifier (the _pkce variant).
revoke all on function public.validate_cross_app_token_with_session(text, text)
  from public, anon, authenticated, service_role;
-- allow-anon-grant: pre-session bearer redemption; refuses challenge-bound tokens.
grant execute on function public.validate_cross_app_token_with_session(text, text)
  -- tuturuuu: reviewed(function-grant): public.validate_cross_app_token_with_session(text,text) anon-required review=SR-M1-pkce-handoff
  to anon, authenticated, service_role;

revoke all on function public.validate_cross_app_token_with_session_pkce(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.validate_cross_app_token_with_session_pkce(text, text, text)
  to service_role;
