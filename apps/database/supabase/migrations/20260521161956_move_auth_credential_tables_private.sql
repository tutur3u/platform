do $$
begin
  if to_regclass('public.cross_app_tokens') is not null then
    alter table public.cross_app_tokens
      set schema private;
  end if;

  if to_regclass('public.internal_email_api_keys') is not null then
    alter table public.internal_email_api_keys
      set schema private;
  end if;
end $$;

revoke all on table private.cross_app_tokens
  from public, anon, authenticated;
revoke all on table private.internal_email_api_keys
  from public, anon, authenticated;

grant all on table private.cross_app_tokens to service_role;
grant all on table private.internal_email_api_keys to service_role;

alter table private.cross_app_tokens enable row level security;
alter table private.internal_email_api_keys enable row level security;

drop policy if exists "select_own_tokens"
  on private.cross_app_tokens;
drop policy if exists "insert_system_only"
  on private.cross_app_tokens;
drop policy if exists "update_system_only"
  on private.cross_app_tokens;
drop policy if exists "delete_system_only"
  on private.cross_app_tokens;
drop policy if exists "Service role can manage private cross-app tokens"
  on private.cross_app_tokens;
drop policy if exists "Enable read access for authenticated users"
  on private.internal_email_api_keys;
drop policy if exists "Service role can manage private internal email API keys"
  on private.internal_email_api_keys;

create policy "Service role can manage private cross-app tokens"
  on private.cross_app_tokens
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private internal email API keys"
  on private.internal_email_api_keys
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.cleanup_expired_cross_app_tokens()
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  delete from private.cross_app_tokens
  where expires_at < now()
    or (used_at is not null and used_at < now() - interval '1 hour');
end;
$$;

create or replace function public.trigger_cleanup_expired_cross_app_tokens()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform public.cleanup_expired_cross_app_tokens();
  return new;
end;
$$;

drop trigger if exists trigger_cleanup_expired_cross_app_tokens
  on private.cross_app_tokens;

create trigger trigger_cleanup_expired_cross_app_tokens
after insert on private.cross_app_tokens
for each statement
execute function public.trigger_cleanup_expired_cross_app_tokens();

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
    now() + (p_expiry_seconds * interval '1 second'),
    p_origin_app,
    p_target_app
  );

  return v_token;
end;
$$;

drop function if exists public.generate_cross_app_token(
  uuid,
  text,
  text,
  integer,
  jsonb
);

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
    now() + (p_expiry_seconds * interval '1 second'),
    p_origin_app,
    p_target_app,
    p_session_data
  );

  return v_token;
end;
$$;

create or replace function public.validate_cross_app_token(
  p_token text,
  p_target_app text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from private.cross_app_tokens
  where token = p_token
    and target_app = p_target_app
    and expires_at > now()
    and used_at is null
    and is_revoked = false;

  if v_user_id is not null then
    update private.cross_app_tokens
    set used_at = now()
    where token = p_token;
  end if;

  return v_user_id;
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

create or replace function public.revoke_all_cross_app_tokens(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_caller uuid;
begin
  v_caller := auth.uid();

  if v_caller is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_user_id is distinct from v_caller then
    raise exception 'Cannot revoke cross-app tokens for another user'
      using errcode = '42501';
  end if;

  update private.cross_app_tokens
  set is_revoked = true
  where user_id = p_user_id
    and is_revoked = false;
end;
$$;

revoke execute on function public.cleanup_expired_cross_app_tokens()
  from public, anon, authenticated;
revoke execute on function public.trigger_cleanup_expired_cross_app_tokens()
  from public, anon, authenticated;
revoke execute on function public.generate_cross_app_token(uuid, text, text, integer)
  from public, anon;
revoke execute on function public.generate_cross_app_token(uuid, text, text, integer, jsonb)
  from public, anon;
revoke execute on function public.validate_cross_app_token(text, text)
  from public, anon, authenticated;
revoke execute on function public.validate_cross_app_token_with_session(text, text)
  from public, anon, authenticated;
revoke execute on function public.revoke_all_cross_app_tokens(uuid)
  from public, anon;

grant execute on function public.generate_cross_app_token(uuid, text, text, integer)
  to authenticated;
grant execute on function public.generate_cross_app_token(uuid, text, text, integer, jsonb)
  to authenticated;
grant execute on function public.validate_cross_app_token(text, text)
  to anon, authenticated, service_role;
grant execute on function public.validate_cross_app_token_with_session(text, text)
  to anon, authenticated, service_role;
grant execute on function public.revoke_all_cross_app_tokens(uuid)
  to authenticated;

comment on table private.cross_app_tokens is
  'Private short-lived cross-app authentication handoff tokens. Access through public RPC helpers or server-owned verification routes only.';

comment on table private.internal_email_api_keys is
  'Private internal email API credentials used by server-owned mail routes. Do not expose through Supabase public REST table access.';
