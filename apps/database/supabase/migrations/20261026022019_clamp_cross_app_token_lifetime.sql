-- Cross-app tokens are one-time handoff credentials. Both generator overloads
-- are executable by `authenticated` and stored the caller's p_expiry_seconds
-- unbounded, so any holder of an access JWT could mint a token that outlives
-- logout. Clamp lifetimes server-side and contain tokens already minted
-- beyond the limit.
--
-- Limits: origin 'cli' 300 s (a person copies the token into a terminal);
-- every other origin 60 s (an immediate redirect). NULL or < 1 is rejected.

create or replace function private.cross_app_token_lifetime_seconds(
  p_origin_app text,
  p_expiry_seconds integer
)
returns integer
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_expiry_seconds is null or p_expiry_seconds < 1 then
    raise exception 'Cross-app token expiry must be at least 1 second'
      using errcode = '22023';
  end if;

  return least(
    p_expiry_seconds,
    case when p_origin_app = 'cli' then 300 else 60 end
  );
end;
$$;

revoke execute on function private.cross_app_token_lifetime_seconds(
  text,
  integer
) from public, anon, authenticated;

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

-- Grants are unchanged by CREATE OR REPLACE; restate them so this migration
-- is self-describing.
revoke execute on function public.generate_cross_app_token(uuid, text, text, integer)
  from public, anon;
revoke execute on function public.generate_cross_app_token(uuid, text, text, integer, jsonb)
  from public, anon;
grant execute on function public.generate_cross_app_token(uuid, text, text, integer)
  to authenticated;
grant execute on function public.generate_cross_app_token(uuid, text, text, integer, jsonb)
  to authenticated;

-- Containment: expire (never delete) every unused token whose expiry is more
-- than 300 s away. Used rows are not touched. Returns the affected count.
create or replace function private.expire_overlong_cross_app_tokens()
returns integer
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_count integer;
begin
  update private.cross_app_tokens
  set expires_at = now()
  where used_at is null
    and expires_at > now() + interval '300 seconds';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function private.expire_overlong_cross_app_tokens()
  from public, anon, authenticated;

do $$
declare
  v_count integer;
begin
  v_count := private.expire_overlong_cross_app_tokens();
  raise notice 'cross_app_tokens containment: expired % unused token(s) with expiry beyond now() + 300 s',
    v_count;
end;
$$;
