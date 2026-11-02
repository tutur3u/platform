BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

create or replace function public.search_users_with_services(
  search_query text,
  page_number integer,
  page_size integer,
  role_filter text default null,
  enabled_filter boolean default null
)
returns table (
  id uuid,
  display_name text,
  deleted boolean,
  avatar_url text,
  handle text,
  bio text,
  created_at timestamp with time zone,
  user_id uuid,
  enabled boolean,
  allow_challenge_management boolean,
  allow_manage_all_challenges boolean,
  allow_role_management boolean,
  email text,
  new_email text,
  birthday date,
  full_name text,
  team_name text[],
  services public.platform_service[]
)
language plpgsql
set search_path = private, public, pg_temp
as $$
begin
  return query
    select
      u.id,
      u.display_name,
      coalesce(ud.deleted, false) as deleted,
      u.avatar_url,
      u.handle,
      u.bio,
      u.created_at,
      ur.user_id,
      ur.enabled,
      ur.allow_challenge_management,
      ur.allow_manage_all_challenges,
      ur.allow_role_management,
      ud.email,
      ud.new_email,
      ud.birthday,
      ud.full_name,
      array_remove(array_agg(distinct t.name), null) as team_name,
      u.services
    from public.platform_user_roles ur
    join public.users u on ur.user_id = u.id
    join public.user_private_details ud on u.id = ud.user_id
    left join private.nova_team_members tm on u.id = tm.user_id
    left join private.nova_teams t on tm.team_id = t.id
    where (u.display_name ilike '%' || search_query || '%' or ud.email ilike '%' || search_query || '%')
      and (role_filter is null or case role_filter
        when 'admin' then ur.allow_role_management = true
        when 'global_manager' then ur.allow_manage_all_challenges = true
        when 'challenge_manager' then ur.allow_challenge_management = true
        when 'member' then ur.allow_challenge_management = false and ur.allow_manage_all_challenges = false and ur.allow_role_management = false
        else true end)
      and (enabled_filter is null or ur.enabled = enabled_filter)
    group by
      u.id,
      u.display_name,
      ud.deleted,
      u.avatar_url,
      u.handle,
      u.bio,
      u.created_at,
      ur.user_id,
      ur.enabled,
      ur.allow_challenge_management,
      ur.allow_manage_all_challenges,
      ur.allow_role_management,
      ud.email,
      ud.new_email,
      ud.birthday,
      ud.full_name,
      u.services
    order by u.created_at desc
    limit page_size
    offset (page_number - 1) * page_size;
end;
$$;

REVOKE ALL ON FUNCTION public.search_users_with_services(text, integer, integer, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_with_services(text, integer, integer, text, boolean) TO service_role;

COMMIT;
