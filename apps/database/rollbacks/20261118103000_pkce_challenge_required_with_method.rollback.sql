-- Manual rollback only: restores the PKCE CHECK and private.redeem_cross_app_token
-- exactly as 20261101090000_bind_cross_app_handoff_pkce defined them. This
-- reopens the method-without-challenge gap. Tokens revoked by the forward
-- migration stay revoked: the revocation is a one-way data change.
BEGIN;

alter table private.cross_app_tokens
  drop constraint if exists cross_app_tokens_code_challenge_check;
alter table private.cross_app_tokens
  add constraint cross_app_tokens_code_challenge_check check (
    (code_challenge is null and code_challenge_method is null)
    or (
      code_challenge_method = 'S256'
      and code_challenge ~ '^[A-Za-z0-9_-]{43}$'
    )
  );

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

COMMIT;
