-- Manual rollback. Retains previously stored token rows.
create or replace function public.generate_cross_app_token(
  p_user_id uuid,
  p_origin_app text,
  p_target_app text,
  p_expiry_seconds integer default 300
)
returns text
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_token text;
  v_caller uuid;
  v_lifetime integer;
begin
  v_caller := auth.uid();

  if v_caller is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_user_id is distinct from v_caller then
    raise exception 'Cannot generate cross-app token for another user'
      using errcode = '42501';
  end if;

  perform private.assert_cross_app_token_apps(p_origin_app, p_target_app);
  v_lifetime := private.cross_app_token_lifetime_seconds(
    p_origin_app,
    p_expiry_seconds
  );
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into private.cross_app_tokens (
    user_id,
    token,
    expires_at,
    origin_app,
    target_app
  ) values (
    p_user_id,
    v_token,
    now() + (v_lifetime * interval '1 second'),
    p_origin_app,
    p_target_app
  );

  return v_token;
end;
$$;

create or replace function public.generate_cross_app_token(
  p_user_id uuid,
  p_origin_app text,
  p_target_app text,
  p_expiry_seconds integer,
  p_session_data jsonb
)
returns text
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_token text;
  v_caller uuid;
  v_lifetime integer;
begin
  v_caller := auth.uid();

  if v_caller is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_user_id is distinct from v_caller then
    raise exception 'Cannot generate cross-app token for another user'
      using errcode = '42501';
  end if;

  perform private.assert_cross_app_token_apps(p_origin_app, p_target_app);
  v_lifetime := private.cross_app_token_lifetime_seconds(
    p_origin_app,
    p_expiry_seconds
  );
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into private.cross_app_tokens (
    user_id,
    token,
    expires_at,
    origin_app,
    target_app,
    session_data
  ) values (
    p_user_id,
    v_token,
    now() + (v_lifetime * interval '1 second'),
    p_origin_app,
    p_target_app,
    p_session_data
  );

  return v_token;
end;
$$;

create or replace function public.validate_cross_app_token_with_session(
  p_token text,
  p_target_app text
)
returns table(user_id uuid, session_data jsonb)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_record record;
  v_required_service public.platform_service;
  v_user_services public.platform_service[];
begin
  select t.user_id, t.session_data, t.origin_app into v_record
  from private.cross_app_tokens t
  where t.token = p_token
    and t.target_app = p_target_app
    and t.expires_at > now()
    and t.used_at is null
    and t.is_revoked = false;

  if v_record.user_id is not null then
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

    update private.cross_app_tokens
    set used_at = now()
    where token = p_token;

    return query select v_record.user_id, v_record.session_data;
  end if;

  return query select null::uuid, null::jsonb;
end;
$$;

revoke execute on function public.generate_cross_app_token(uuid, text, text, integer) from public, anon;
revoke execute on function public.generate_cross_app_token(uuid, text, text, integer, jsonb) from public, anon;
grant execute on function public.generate_cross_app_token(uuid, text, text, integer) to authenticated;
grant execute on function public.generate_cross_app_token(uuid, text, text, integer, jsonb) to authenticated;
-- Redemption authenticates possession of the one-time bearer token.
revoke execute on function public.validate_cross_app_token_with_session(text, text) from public;
grant execute on function public.validate_cross_app_token_with_session(text, text) to anon, authenticated, service_role;

drop function private.cross_app_verified_session_data(uuid, jsonb);
