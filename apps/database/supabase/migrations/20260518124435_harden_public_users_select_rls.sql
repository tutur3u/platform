drop policy if exists "Enable read access for authenticated users" on "public"."users";
drop policy if exists "Enable read access for current user and workspace members" on "public"."users";
drop policy if exists "Enable read access for current user and workspace users" on "public"."user_private_details";
drop policy if exists "Enable read access for currently signed user" on "public"."user_private_details";

alter table "public"."user_private_details"
  add column if not exists "services" public.platform_service[],
  add column if not exists "timezone" text,
  add column if not exists "first_day_of_week" text,
  add column if not exists "time_format" text,
  add column if not exists "deleted" boolean;

insert into "public"."user_private_details" (
  "user_id",
  "services",
  "timezone",
  "first_day_of_week",
  "time_format",
  "deleted"
)
select
  "users"."id",
  coalesce(
    "users"."services",
    '{TUTURUUU}'::public.platform_service[]
  ),
  coalesce("users"."timezone", 'auto'),
  coalesce("users"."first_day_of_week", 'auto'),
  coalesce("users"."time_format", 'auto'),
  coalesce("users"."deleted", false)
from "public"."users"
on conflict ("user_id") do nothing;

update "public"."user_private_details"
set
  "services" = coalesce(
    "users"."services",
    '{TUTURUUU}'::public.platform_service[]
  ),
  "timezone" = coalesce("users"."timezone", 'auto'),
  "first_day_of_week" = coalesce("users"."first_day_of_week", 'auto'),
  "time_format" = coalesce("users"."time_format", 'auto'),
  "deleted" = coalesce("users"."deleted", false)
from "public"."users"
where "users"."id" = "user_private_details"."user_id";

alter table "public"."user_private_details"
  alter column "services" set default '{TUTURUUU}'::public.platform_service[],
  alter column "services" set not null,
  alter column "timezone" set default 'auto',
  alter column "first_day_of_week" set default 'auto',
  alter column "time_format" set default 'auto',
  alter column "deleted" set default false;

alter table "public"."user_private_details"
  drop constraint if exists "user_private_details_first_day_of_week_check",
  add constraint "user_private_details_first_day_of_week_check"
    check ("first_day_of_week" in ('auto', 'sunday', 'monday', 'saturday')),
  drop constraint if exists "user_private_details_time_format_check",
  add constraint "user_private_details_time_format_check"
    check ("time_format" in ('auto', '12h', '24h'));

comment on column "public"."user_private_details"."services" is
'Private list of platform services enabled for this account.';

comment on column "public"."user_private_details"."timezone" is
'User timezone preference (IANA identifier or "auto"). Overrides workspace timezone for display.';

comment on column "public"."user_private_details"."first_day_of_week" is
'User first day of week preference: "auto" (locale-based), "sunday", "monday", or "saturday". Overrides workspace setting.';

comment on column "public"."user_private_details"."time_format" is
'User preference for time display format: auto (detect from locale), 12h (AM/PM), or 24h (military time).';

comment on column "public"."user_private_details"."deleted" is
'Private account deletion marker mirrored from auth user deletion handling.';

create policy "Enable read access for current user and workspace users"
on "public"."user_private_details"
as permissive
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.workspace_members viewer_member
      join public.workspace_members target_member
        on target_member.ws_id = viewer_member.ws_id
      where viewer_member.user_id = (select auth.uid())
        and target_member.user_id = "user_private_details".user_id
    )
  )
);

comment on policy "Enable read access for current user and workspace users"
on "public"."user_private_details" is
'Allows private profile reads only for the signed-in user or users who share a workspace with the signed-in user.';

create policy "Enable read access for current user and workspace members"
on "public"."users"
as permissive
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    id = (select auth.uid())
    or exists (
      select 1
      from public.workspace_members viewer_member
      join public.workspace_members target_member
        on target_member.ws_id = viewer_member.ws_id
      where viewer_member.user_id = (select auth.uid())
        and target_member.user_id = "users".id
    )
  )
);

comment on policy "Enable read access for current user and workspace members"
on "public"."users" is
'Prevents authenticated Data API callers from enumerating every platform user while preserving self-profile and shared-workspace profile lookups.';

create or replace function public.on_delete_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_private_details
  set deleted = true
  where user_id = old.id;

  delete from public.workspace_members
  where user_id = old.id;

  return old;
end;
$$;

create or replace function public.search_users_by_name(
  search_query text,
  result_limit integer default 5,
  min_similarity double precision default 0.3
)
returns table (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  relevance double precision
)
language plpgsql
as $$
begin
  return query
  select
    u.id,
    u.handle,
    u.display_name,
    u.avatar_url,
    greatest(
      similarity(u.handle, search_query),
      similarity(u.display_name, search_query)
    )::double precision as relevance
  from public.users u
  join public.user_private_details upd on upd.user_id = u.id
  where coalesce(upd.deleted, false) = false
    and (
      similarity(u.handle, search_query) >= min_similarity
      or similarity(u.display_name, search_query) >= min_similarity
    )
  order by greatest(
      similarity(u.handle, search_query),
      similarity(u.display_name, search_query)
    ) desc,
    u.created_at
  limit result_limit;
end;
$$;

drop function if exists public.search_users(text, integer, integer, text, boolean);

create function public.search_users(
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
    left join public.nova_team_members tm on u.id = tm.user_id
    left join public.nova_teams t on tm.team_id = t.id
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

create or replace function public.validate_cross_app_token_with_session(
  p_token text,
  p_target_app text
)
returns table(user_id uuid, session_data jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record record;
  v_required_service public.platform_service;
  v_user_services public.platform_service[];
begin
  select t.user_id, t.session_data, t.origin_app into v_record
  from public.cross_app_tokens t
  where t.token = p_token
    and t.target_app = p_target_app
    and t.expires_at > now()
    and t.used_at is null
    and t.is_revoked = false;

  raise notice 'Found token record: user_id=%, session_data=%, origin_app=%',
    v_record.user_id,
    v_record.session_data,
    v_record.origin_app;

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
        and not (v_required_service = any(coalesce(v_user_services, '{}'::public.platform_service[])))
      then
        raise notice 'Adding missing service % for user % accessing target app %',
          v_required_service,
          v_record.user_id,
          p_target_app;

        update public.user_private_details private_details
        set services = array_append(
          coalesce(private_details.services, '{}'::public.platform_service[]),
          v_required_service
        )
        where private_details.user_id = v_record.user_id;
      end if;
    end if;

    update public.cross_app_tokens
    set used_at = now()
    where token = p_token;

    return query select v_record.user_id, v_record.session_data;
  else
    return query select null::uuid, null::jsonb;
  end if;
end;
$$;

alter table "public"."users"
  drop column if exists "services",
  drop column if exists "timezone",
  drop column if exists "first_day_of_week",
  drop column if exists "time_format",
  drop column if exists "deleted";
