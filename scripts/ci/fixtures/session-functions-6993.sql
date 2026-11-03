-- Harden the session-management definers from 20250611073234.
-- Signatures and result shapes are unchanged. Each function now requires an
-- authenticated caller acting on their own id, or the service role, pins a
-- catalog-only search_path with schema-qualified references, and is executable
-- only by authenticated and service_role.

create or replace function public.get_user_sessions(user_id uuid)
returns table (
  session_id text,
  created_at timestamptz,
  updated_at timestamptz,
  user_agent text,
  ip text,
  is_current boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and (auth.uid() is null or auth.uid() is distinct from get_user_sessions.user_id) then
    raise exception 'Unauthorized access to sessions' using errcode = '42501';
  end if;

  return query
  select
    s.id::text as session_id,
    s.created_at,
    s.updated_at,
    coalesce(s.user_agent, 'Unknown') as user_agent,
    coalesce(s.ip::text, 'Unknown') as ip,
    (s.id::text = coalesce(auth.jwt() ->> 'session_id', ''))::boolean as is_current
  from auth.sessions s
  where s.user_id = get_user_sessions.user_id
  order by s.updated_at desc;
end;
$$;

create or replace function public.revoke_user_session(
  target_user_id uuid,
  session_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  session_found boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and (auth.uid() is null or auth.uid() is distinct from revoke_user_session.target_user_id) then
    raise exception 'Unauthorized access to sessions' using errcode = '42501';
  end if;

  select exists (
    select 1
    from auth.sessions s
    where s.id = revoke_user_session.session_id::uuid
      and s.user_id = revoke_user_session.target_user_id
  ) into session_found;

  if not session_found then
    raise exception 'Session not found or unauthorized';
  end if;

  delete from auth.sessions s
  where s.id = revoke_user_session.session_id::uuid
    and s.user_id = revoke_user_session.target_user_id;

  return true;
end;
$$;

create or replace function public.revoke_all_other_sessions(user_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  current_session_id text;
  revoked_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and (auth.uid() is null or auth.uid() is distinct from revoke_all_other_sessions.user_id) then
    raise exception 'Unauthorized access to sessions' using errcode = '42501';
  end if;

  current_session_id := auth.jwt() ->> 'session_id';

  delete from auth.sessions s
  where s.user_id = revoke_all_other_sessions.user_id
    and (
      current_session_id is null
      or current_session_id = ''
      or s.id::text <> current_session_id
    );

  get diagnostics revoked_count = row_count;

  return revoked_count;
end;
$$;

create or replace function public.get_user_session_stats(user_id uuid)
returns table (
  total_sessions integer,
  active_sessions integer,
  current_session_age interval
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  current_session_id text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and (auth.uid() is null or auth.uid() is distinct from get_user_session_stats.user_id) then
    raise exception 'Unauthorized access to session stats' using errcode = '42501';
  end if;

  current_session_id := auth.jwt() ->> 'session_id';

  return query
  select
    count(*)::integer as total_sessions,
    count(case when s.updated_at > now() - interval '1 hour' then 1 end)::integer
      as active_sessions,
    case
      when current_session_id is not null and current_session_id <> '' then
        now() - (
          select cs.created_at
          from auth.sessions cs
          where cs.id::text = current_session_id
        )
      else interval '0'
    end as current_session_age
  from auth.sessions s
  where s.user_id = get_user_session_stats.user_id
    and s.updated_at > now() - interval '30 days';
end;
$$;

revoke all on function public.get_user_sessions(uuid) from public, anon;
revoke all on function public.revoke_user_session(uuid, text) from public, anon;
revoke all on function public.revoke_all_other_sessions(uuid) from public, anon;
revoke all on function public.get_user_session_stats(uuid) from public, anon;

grant execute on function public.get_user_sessions(uuid) to authenticated, service_role;
grant execute on function public.revoke_user_session(uuid, text) to authenticated, service_role;
grant execute on function public.revoke_all_other_sessions(uuid) to authenticated, service_role;
grant execute on function public.get_user_session_stats(uuid) to authenticated, service_role;
