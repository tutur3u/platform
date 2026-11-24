-- Course and roster writes follow manage_courses, the creator-grant course
-- permission. This supersedes the update and delete policies on
-- public.workspace_user_groups and the insert, update and delete policies on
-- public.workspace_user_groups_users from
-- 20261120193401_restrict_course_roster_writes.sql, which keyed those writes
-- on update_user_groups. Permissive policies combine with OR, so those
-- policies are dropped rather than kept beside the manage_courses ones.
-- The member-wide read policies and the create_user_groups insert policy from
-- that migration stay in place.
-- Trigger inventory addendum (has_workspace_permission caller added here; it
-- evaluates auth.uid() for end-user requests and the verified creator for
-- trusted server inserts):
--   public.handle_workspace_user_group_creator_assignment()
set local lock_timeout = '2s';
set local statement_timeout = '10s';

drop policy if exists "Enable all access for organization members"
on public.workspace_user_groups;
drop policy if exists workspace_user_groups_update_group_managers
on public.workspace_user_groups;
drop policy if exists workspace_user_groups_delete_group_managers
on public.workspace_user_groups;

-- Restrictive: narrows the create_user_groups insert policy.
create policy "Course creators insert workspace groups"
on public.workspace_user_groups as restrictive for insert to authenticated
with check (
  (creator_id is null or creator_id = (select auth.uid()))
  and public.is_org_member((select auth.uid()), ws_id)
  and public.has_workspace_permission(ws_id, (select auth.uid()), 'create_user_groups')
  and (
    is_course_published is false
    or public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_courses')
  )
);

create policy "Course managers update workspace groups"
on public.workspace_user_groups for update to authenticated
using (
  public.is_org_member((select auth.uid()), ws_id)
  and public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_courses')
)
with check (
  public.is_org_member((select auth.uid()), ws_id)
  and public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_courses')
);

create policy "Course managers delete workspace groups"
on public.workspace_user_groups for delete to authenticated
using (
  public.is_org_member((select auth.uid()), ws_id)
  and public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_courses')
);

revoke truncate, trigger on public.workspace_user_groups
from public, anon, authenticated;

drop policy if exists "Enable all access for organization members"
on public.workspace_user_groups_users;
drop policy if exists workspace_user_groups_users_insert_group_managers
on public.workspace_user_groups_users;
drop policy if exists workspace_user_groups_users_update_group_managers
on public.workspace_user_groups_users;
drop policy if exists workspace_user_groups_users_delete_group_managers
on public.workspace_user_groups_users;

create policy "Course managers insert group memberships"
on public.workspace_user_groups_users for insert to authenticated
with check (
  exists (
    select 1 from public.workspace_user_groups as g
    join public.workspace_users as contact on contact.ws_id = g.ws_id
    where g.id = workspace_user_groups_users.group_id
      and contact.id = workspace_user_groups_users.user_id
      and public.has_workspace_permission(g.ws_id, (select auth.uid()), 'manage_courses')
  )
);

create policy "Course managers update group memberships"
on public.workspace_user_groups_users for update to authenticated
using (
  public.has_workspace_permission((
    select g.ws_id from public.workspace_user_groups as g
    where g.id = workspace_user_groups_users.group_id
  ), (select auth.uid()), 'manage_courses')
)
with check (
  exists (
    select 1 from public.workspace_user_groups as g
    join public.workspace_users as contact on contact.ws_id = g.ws_id
    where g.id = workspace_user_groups_users.group_id
      and contact.id = workspace_user_groups_users.user_id
      and public.has_workspace_permission(g.ws_id, (select auth.uid()), 'manage_courses')
  )
);

create policy "Course managers delete group memberships"
on public.workspace_user_groups_users for delete to authenticated
using (
  public.has_workspace_permission((
    select g.ws_id from public.workspace_user_groups as g
    where g.id = workspace_user_groups_users.group_id
  ), (select auth.uid()), 'manage_courses')
);

revoke truncate, trigger on public.workspace_user_groups_users
from public, anon, authenticated;

-- tuturuuu: no-grant (trigger)
create or replace function public.handle_workspace_user_group_creator_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  -- End-user requests evaluate only the caller; trusted server inserts name
  -- the verified creator.
  subject_id uuid := case
    when coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) in ('anon', 'authenticated') then auth.uid()
    else new.creator_id
  end;
begin
  -- For a user-scoped insert, require that the request actor and creator are
  -- the same person.
  if new.creator_id is null
    or (actor_id is not null and actor_id <> new.creator_id)
    or subject_id is distinct from new.creator_id
    or not public.is_org_member(subject_id, new.ws_id)
    or public.has_workspace_permission(new.ws_id, subject_id, 'manage_courses') is distinct from true
  then
    return new;
  end if;

  insert into public.workspace_user_groups_users (group_id, user_id, role)
  select new.id, contact.id, 'TEACHER'
  from public.workspace_user_linked_users as linked
  join public.workspace_users as contact
    on contact.id = linked.virtual_user_id and contact.ws_id = linked.ws_id
  where linked.platform_user_id = subject_id
    and linked.ws_id = new.ws_id
    and contact.archived is false
  on conflict (group_id, user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_workspace_user_group_creator_assignment()
from public, anon, authenticated, service_role;

create or replace function private.admin_update_workspace_user_group_with_audit_actor(
  p_ws_id uuid,
  p_group_id uuid,
  p_payload jsonb,
  p_actor_auth_uid uuid default null
)
returns public.workspace_user_groups
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  updated_row public.workspace_user_groups;
  current_group public.workspace_user_groups;
begin
  if p_payload ?| array['is_course_published', 'archived', 'is_guest'] then
    select g.* into current_group
    from public.workspace_user_groups as g
    where g.ws_id = p_ws_id and g.id = p_group_id
    for update;

    if not found then return null; end if;

    if (
      (
        p_payload ? 'is_course_published'
        and current_group.is_course_published is distinct from
          coalesce(nullif(p_payload->>'is_course_published', '')::boolean, false)
      )
      or (
        current_group.is_course_published
        and (
          (p_payload ? 'archived' and current_group.archived is distinct from
            coalesce(nullif(p_payload->>'archived', '')::boolean, false))
          or (p_payload ? 'is_guest' and current_group.is_guest is distinct from
            nullif(p_payload->>'is_guest', '')::boolean)
        )
      )
    ) and (
      not public.is_org_member(p_actor_auth_uid, p_ws_id)
      or public.has_workspace_permission(p_ws_id, p_actor_auth_uid, 'manage_courses') is distinct from true
    ) then
      raise exception 'course visibility requires manage_courses' using errcode = '42501';
    end if;
  end if;

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  update public.workspace_user_groups as workspace_group
  set
    name = case
      when p_payload ? 'name' then nullif(p_payload->>'name', '')
      else workspace_group.name
    end,
    is_guest = case
      when p_payload ? 'is_guest' then nullif(p_payload->>'is_guest', '')::boolean
      else workspace_group.is_guest
    end,
    starting_date = case
      when p_payload ? 'starting_date' then nullif(p_payload->>'starting_date', '')::timestamptz
      else workspace_group.starting_date
    end,
    ending_date = case
      when p_payload ? 'ending_date' then nullif(p_payload->>'ending_date', '')::timestamptz
      else workspace_group.ending_date
    end,
    notes = case
      when p_payload ? 'notes' then nullif(p_payload->>'notes', '')
      else workspace_group.notes
    end,
    description = case
      when p_payload ? 'description' then nullif(p_payload->>'description', '')
      else workspace_group.description
    end,
    archived = case
      when p_payload ? 'archived' then coalesce(nullif(p_payload->>'archived', '')::boolean, false)
      else workspace_group.archived
    end,
    is_course_published = case
      when p_payload ? 'is_course_published' then coalesce(nullif(p_payload->>'is_course_published', '')::boolean, false)
      else workspace_group.is_course_published
    end
  where workspace_group.ws_id = p_ws_id
    and workspace_group.id = p_group_id
  returning * into updated_row;

  return updated_row;
end;
$function$;

revoke all on function private.admin_update_workspace_user_group_with_audit_actor(uuid, uuid, jsonb, uuid)
from public, anon, authenticated;
grant execute on function private.admin_update_workspace_user_group_with_audit_actor(uuid, uuid, jsonb, uuid)
to service_role;

create or replace function private.admin_delete_workspace_user_group_with_audit_actor(
  p_ws_id uuid,
  p_group_id uuid,
  p_actor_auth_uid uuid default null
)
returns public.workspace_user_groups
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  is_published boolean;
  deleted_row public.workspace_user_groups;
begin
  select g.is_course_published into is_published
  from public.workspace_user_groups as g
  where g.ws_id = p_ws_id and g.id = p_group_id
  for update;

  if not found then return null; end if;

  if (
    is_published
    or exists (
      select 1 from public.workspace_user_groups_users as membership
      where membership.group_id = p_group_id
    )
    or exists (
      select 1 from public.workspace_course_modules as lesson
      where lesson.group_id = p_group_id
    )
    or exists (
      select 1 from public.course_tests as assessment
      where assessment.course_id = p_group_id
    )
  ) and (
    not public.is_org_member(p_actor_auth_uid, p_ws_id)
    or public.has_workspace_permission(p_ws_id, p_actor_auth_uid, 'manage_courses') is distinct from true
  ) then
    raise exception 'course deletion requires manage_courses' using errcode = '42501';
  end if;

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  delete from public.workspace_user_groups
  where ws_id = p_ws_id and id = p_group_id
  returning * into deleted_row;

  return deleted_row;
end;
$$;

revoke all on function private.admin_delete_workspace_user_group_with_audit_actor(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function private.admin_delete_workspace_user_group_with_audit_actor(uuid, uuid, uuid)
to service_role;

create or replace function "private"."admin_upsert_workspace_user_group_members_with_audit_actor"(
  p_ws_id uuid,
  p_group_id uuid,
  p_user_ids uuid[],
  p_role text default 'STUDENT',
  p_actor_auth_uid uuid default null
)
returns setof "public"."workspace_user_groups_users"
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  invalid_count integer;
begin
  if not public.is_org_member(p_actor_auth_uid, p_ws_id)
    or public.has_workspace_permission(p_ws_id, p_actor_auth_uid, 'manage_courses') is distinct from true
  then
    raise exception 'course membership requires manage_courses' using errcode = '42501';
  end if;

  perform 1 from public.workspace_user_groups as workspace_group
  where workspace_group.id = p_group_id and workspace_group.ws_id = p_ws_id
  for update;
  if not found then
    raise exception 'user_group_not_found' using errcode = '42501';
  end if;

  select count(*)
  into invalid_count
  from unnest(coalesce(p_user_ids, array[]::uuid[])) as requested_user(user_id)
  left join "public"."workspace_users" workspace_user
    on workspace_user."id" = requested_user.user_id
   and workspace_user."ws_id" = p_ws_id
  where workspace_user."id" is null;

  if invalid_count > 0 then
    raise exception 'user_group_member_workspace_mismatch' using errcode = '42501';
  end if;

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  return query
  insert into "public"."workspace_user_groups_users" (
    "group_id",
    "user_id",
    "role"
  )
  select distinct
    p_group_id,
    requested_user.user_id,
    coalesce(nullif(p_role, ''), 'STUDENT')
  from unnest(coalesce(p_user_ids, array[]::uuid[])) as requested_user(user_id)
  on conflict ("group_id", "user_id")
  do update set "role" = excluded."role"
  returning *;
end;
$function$;

revoke all on function private.admin_upsert_workspace_user_group_members_with_audit_actor(uuid, uuid, uuid[], text, uuid)
from public, anon, authenticated;
grant execute on function private.admin_upsert_workspace_user_group_members_with_audit_actor(uuid, uuid, uuid[], text, uuid)
to service_role;

create or replace function "private"."admin_delete_workspace_user_group_member_with_audit_actor"(
  p_ws_id uuid,
  p_group_id uuid,
  p_user_id uuid,
  p_actor_auth_uid uuid default null
)
returns "public"."workspace_user_groups_users"
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  deleted_row "public"."workspace_user_groups_users";
begin
  if not public.is_org_member(p_actor_auth_uid, p_ws_id)
    or public.has_workspace_permission(p_ws_id, p_actor_auth_uid, 'manage_courses') is distinct from true
  then
    raise exception 'course membership requires manage_courses' using errcode = '42501';
  end if;

  perform 1 from public.workspace_user_groups as workspace_group
  where workspace_group.id = p_group_id and workspace_group.ws_id = p_ws_id
  for update;
  if not found then
    raise exception 'user_group_not_found' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from "public"."workspace_users" workspace_user
    where workspace_user."id" = p_user_id
      and workspace_user."ws_id" = p_ws_id
  ) then
    raise exception 'user_group_member_workspace_mismatch' using errcode = '42501';
  end if;

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  delete from "public"."workspace_user_groups_users"
  where "group_id" = p_group_id
    and "user_id" = p_user_id
  returning * into deleted_row;

  return deleted_row;
end;
$function$;

revoke all on function private.admin_delete_workspace_user_group_member_with_audit_actor(uuid, uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function private.admin_delete_workspace_user_group_member_with_audit_actor(uuid, uuid, uuid, uuid)
to service_role;
