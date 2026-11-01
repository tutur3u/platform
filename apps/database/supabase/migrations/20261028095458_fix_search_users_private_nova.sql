-- Preserve the latest definition and its ACL; Nova tables moved to private.
create or replace function public.search_users(
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
  team_name text[]
)
language plpgsql
set search_path = private, public, pg_temp
as $$
declare
  where_clause text := '';
begin
  where_clause :=
    '(u.display_name ilike ''%'' || $1 || ''%'' or ud.email ilike ''%'' || $1 || ''%'')';

  if role_filter is not null then
    case role_filter
      when 'admin' then
        where_clause := where_clause || ' and ur.allow_role_management = true';
      when 'global_manager' then
        where_clause := where_clause || ' and ur.allow_manage_all_challenges = true';
      when 'challenge_manager' then
        where_clause := where_clause || ' and ur.allow_challenge_management = true';
      when 'member' then
        where_clause := where_clause || ' and ur.allow_challenge_management = false and ur.allow_manage_all_challenges = false and ur.allow_role_management = false';
      else
        null;
    end case;
  end if;

  if enabled_filter is not null then
    where_clause := where_clause || ' and ur.enabled = ' || enabled_filter::text;
  end if;

  return query execute '
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
      array_remove(array_agg(distinct t.name), null) as team_name
    from public.platform_user_roles ur
    join public.users u on ur.user_id = u.id
    join public.user_private_details ud on u.id = ud.user_id
    left join private.nova_team_members tm on u.id = tm.user_id
    left join private.nova_teams t on tm.team_id = t.id
    where ' || where_clause || '
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
      ud.full_name
    order by u.created_at desc
    limit $2
    offset ($3 - 1) * $2
  ' using search_query, page_size, page_number;
end;
$$;
