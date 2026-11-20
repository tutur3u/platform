set local lock_timeout = '2s';
set local statement_timeout = '10s';

create function private.admin_sync_guest_group_memberships(
  p_ws_id uuid,
  p_user_id uuid,
  p_actor_auth_uid uuid,
  p_is_guest boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  can_manage_courses boolean;
  guest_group_ids uuid[];
begin
  if p_is_guest is null
    or not public.is_org_member(p_actor_auth_uid, p_ws_id)
    or (
      public.has_workspace_permission(p_ws_id, p_actor_auth_uid, 'update_users') is distinct from true
      and (
        not p_is_guest
        or public.has_workspace_permission(p_ws_id, p_actor_auth_uid, 'create_users') is distinct from true
      )
    )
  then
    raise exception 'Contact access is required' using errcode = '42501';
  end if;

  perform 1 from public.workspace_users as contact
  where contact.id = p_user_id and contact.ws_id = p_ws_id
  for key share;
  if not found then
    raise exception 'Contact access is required' using errcode = '42501';
  end if;

  can_manage_courses := public.has_workspace_permission(p_ws_id, p_actor_auth_uid, 'manage_courses') is true;

  select array_agg(eligible.id) into guest_group_ids
  from (
    select g.id from public.workspace_user_groups as g
    where g.ws_id = p_ws_id and g.is_guest is true
      and (
        can_manage_courses or (
          g.is_course_published is false
          and not exists (
            select 1 from public.workspace_course_modules as lesson where lesson.group_id = g.id
          )
          and not exists (
            select 1 from public.course_tests as assessment where assessment.course_id = g.id
          )
        )
      )
    order by g.id
    for share
  ) as eligible;

  if guest_group_ids is null then return false; end if;

  perform set_config('audit.override_auth_uid', p_actor_auth_uid::text, true);
  if p_is_guest then
    insert into public.workspace_user_groups_users (group_id, user_id)
    select group_id, p_user_id from unnest(guest_group_ids) as eligible(group_id)
    on conflict (group_id, user_id) do nothing;
  else
    delete from public.workspace_user_groups_users as membership
    where membership.user_id = p_user_id and membership.group_id = any(guest_group_ids)
      and (can_manage_courses or membership.role is distinct from 'TEACHER');
  end if;
  return true;
end;
$$;

revoke all on function private.admin_sync_guest_group_memberships(uuid, uuid, uuid, boolean)
from public, anon, authenticated, service_role;
grant execute on function private.admin_sync_guest_group_memberships(uuid, uuid, uuid, boolean)
to service_role;
