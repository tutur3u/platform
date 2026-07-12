-- Keep user-group manager profiles linked to their platform accounts whenever
-- the workspace identity match is deterministic. This closes a legacy gap:
-- workspace members normally receive a link when membership is created, but an
-- older or imported manager profile can still be assigned later without one.

create or replace function private.consolidate_user_group_manager_link(
  p_workspace_user_id uuid,
  p_ws_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_email text;
  v_existing_platform_user_id uuid;
  v_matching_platform_user_count integer := 0;
  v_matching_platform_user_id uuid;
  v_matching_workspace_profile_count integer := 0;
begin
  select linked_user.platform_user_id
  into v_existing_platform_user_id
  from public.workspace_user_linked_users linked_user
  where linked_user.virtual_user_id = p_workspace_user_id
    and linked_user.ws_id = p_ws_id
  order by linked_user.created_at
  limit 1;

  if v_existing_platform_user_id is not null then
    return v_existing_platform_user_id;
  end if;

  select nullif(lower(btrim(workspace_user.email)), '')
  into v_email
  from public.workspace_users workspace_user
  where workspace_user.id = p_workspace_user_id
    and workspace_user.ws_id = p_ws_id;

  if v_email is null then
    return null;
  end if;

  -- Serialize candidates sharing an email inside a workspace. The platform/ws
  -- primary key already prevents duplicate platform links; this lock also
  -- prevents two virtual profiles from racing to claim the same identity.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'user-group-manager-link:' || p_ws_id::text || ':' || v_email,
      0
    )
  );

  select linked_user.platform_user_id
  into v_existing_platform_user_id
  from public.workspace_user_linked_users linked_user
  where linked_user.virtual_user_id = p_workspace_user_id
    and linked_user.ws_id = p_ws_id
  order by linked_user.created_at
  limit 1;

  if v_existing_platform_user_id is not null then
    return v_existing_platform_user_id;
  end if;

  select count(*)::integer
  into v_matching_workspace_profile_count
  from public.workspace_users workspace_user
  where workspace_user.ws_id = p_ws_id
    and nullif(lower(btrim(workspace_user.email)), '') = v_email
    and not exists (
      select 1
      from public.workspace_user_linked_users linked_user
      where linked_user.virtual_user_id = workspace_user.id
        and linked_user.ws_id = p_ws_id
    );

  if v_matching_workspace_profile_count <> 1 then
    return null;
  end if;

  select
    count(distinct workspace_member.user_id)::integer,
    min(workspace_member.user_id::text)::uuid
  into v_matching_platform_user_count, v_matching_platform_user_id
  from public.workspace_members workspace_member
  inner join public.user_private_details private_details
    on private_details.user_id = workspace_member.user_id
  where workspace_member.ws_id = p_ws_id
    and nullif(lower(btrim(private_details.email)), '') = v_email;

  if v_matching_platform_user_count <> 1
    or v_matching_platform_user_id is null
  then
    return null;
  end if;

  if exists (
    select 1
    from public.workspace_user_linked_users linked_user
    where linked_user.platform_user_id = v_matching_platform_user_id
      and linked_user.ws_id = p_ws_id
  ) then
    return null;
  end if;

  insert into public.workspace_user_linked_users (
    platform_user_id,
    virtual_user_id,
    ws_id
  )
  values (
    v_matching_platform_user_id,
    p_workspace_user_id,
    p_ws_id
  )
  on conflict (platform_user_id, ws_id) do nothing;

  select linked_user.platform_user_id
  into v_existing_platform_user_id
  from public.workspace_user_linked_users linked_user
  where linked_user.virtual_user_id = p_workspace_user_id
    and linked_user.ws_id = p_ws_id
  order by linked_user.created_at
  limit 1;

  return v_existing_platform_user_id;
end;
$$;

create or replace function private.consolidate_user_group_manager_link_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_ws_id uuid;
begin
  if new.role is distinct from 'TEACHER' then
    return new;
  end if;

  select user_group.ws_id
  into v_ws_id
  from public.workspace_user_groups user_group
  where user_group.id = new.group_id;

  if v_ws_id is not null then
    perform private.consolidate_user_group_manager_link(new.user_id, v_ws_id);
  end if;

  return new;
end;
$$;

revoke all on function private.consolidate_user_group_manager_link(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.consolidate_user_group_manager_link_trigger()
from public, anon, authenticated, service_role;

drop trigger if exists consolidate_user_group_manager_link
on public.workspace_user_groups_users;

create trigger consolidate_user_group_manager_link
after insert or update of role, user_id, group_id
on public.workspace_user_groups_users
for each row
when (new.role = 'TEACHER')
execute function private.consolidate_user_group_manager_link_trigger();

-- Repair existing deterministic manager identities during rollout. Ambiguous
-- emails, missing workspace memberships, and already-claimed platform accounts
-- are intentionally left untouched for manual review.
do $$
declare
  manager_record record;
begin
  for manager_record in
    select distinct membership.user_id, user_group.ws_id
    from public.workspace_user_groups_users membership
    inner join public.workspace_user_groups user_group
      on user_group.id = membership.group_id
    where membership.role = 'TEACHER'
  loop
    perform private.consolidate_user_group_manager_link(
      manager_record.user_id,
      manager_record.ws_id
    );
  end loop;
end;
$$;
