-- Manual rollback for 20261101090000_bind_cross_app_handoff_pkce.sql.
-- Apply manually. Outstanding challenge-bound tokens are revoked first: once
-- the challenge columns are dropped they would otherwise redeem without the
-- verifier. The two-argument public.validate_cross_app_token_with_session
-- wrapper and its ACL are kept; its private helper is restored to the
-- pre-PKCE redemption body of
-- 20261027151020_bind_cross_app_verified_identity.sql (verifier ignored), so
-- redemption behaves as before the forward migration. No grants are restated.
begin;

update private.cross_app_tokens
set is_revoked = true
where code_challenge is not null
  and used_at is null;

drop function if exists public.validate_cross_app_token_with_session_pkce(text, text, text);
drop function if exists public.generate_cross_app_token_pkce(uuid, text, text, integer, jsonb, text, text);

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
begin
  select
    t.user_id,
    private.cross_app_verified_session_data(t.user_id, t.session_data)
      as session_data,
    t.origin_app
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

revoke all on function private.redeem_cross_app_token(text, text, text)
  from public, anon, authenticated, service_role;

alter table private.cross_app_tokens
  drop constraint if exists cross_app_tokens_code_challenge_check;
alter table private.cross_app_tokens
  drop column if exists code_challenge_method,
  drop column if exists code_challenge;

commit;
