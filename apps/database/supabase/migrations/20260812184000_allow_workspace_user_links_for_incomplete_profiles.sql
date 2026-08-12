-- A platform profile is created with only its auth user id. Display name,
-- handle, private full name, and email may all remain null until onboarding or
-- profile setup is completed. Link repair must distinguish a missing user row
-- from a valid user whose optional display name is null.
create or replace function public.ensure_workspace_user_link(
  target_user_id uuid,
  target_ws_id uuid
)
returns uuid as $$
declare
  existing_virtual_user_id uuid;
  matching_workspace_user_count integer := 0;
  matching_workspace_user_id uuid;
  new_workspace_user_id uuid;
  user_exists boolean := false;
  user_display_name text;
  user_email text;
begin
  select virtual_user_id into existing_virtual_user_id
  from public.workspace_user_linked_users
  where platform_user_id = target_user_id
    and ws_id = target_ws_id;

  if existing_virtual_user_id is not null then
    return existing_virtual_user_id;
  end if;

  if not exists (
    select 1
    from public.workspace_members
    where user_id = target_user_id
      and ws_id = target_ws_id
  ) then
    raise exception 'User % is not a member of workspace %', target_user_id, target_ws_id;
  end if;

  select
    true,
    coalesce(
      nullif(trim(u.display_name), ''),
      nullif(trim(upd.full_name), ''),
      nullif(trim(u.handle), ''),
      nullif(trim(upd.email), ''),
      format('User %s', left(target_user_id::text, 8))
    ),
    nullif(trim(coalesce(upd.email, '')), '')
  into user_exists, user_display_name, user_email
  from public.users u
  left join public.user_private_details upd on upd.user_id = u.id
  where u.id = target_user_id;

  if not user_exists then
    raise exception 'User % not found', target_user_id;
  end if;

  if user_email is not null then
    select count(*), (array_agg(wu.id order by wu.id::text))[1]
    into matching_workspace_user_count, matching_workspace_user_id
    from public.workspace_users wu
    where wu.ws_id = target_ws_id
      and wu.email is not null
      and lower(trim(wu.email)) = lower(user_email)
      and not exists (
        select 1
        from public.workspace_user_linked_users wul
        where wul.virtual_user_id = wu.id
      );
  end if;

  if matching_workspace_user_count = 1
    and matching_workspace_user_id is not null then
    new_workspace_user_id := matching_workspace_user_id;
  else
    new_workspace_user_id := gen_random_uuid();

    insert into public.workspace_users (id, ws_id, display_name, email)
    values (
      new_workspace_user_id,
      target_ws_id,
      user_display_name,
      coalesce(user_email, '')
    );
  end if;

  insert into public.workspace_user_linked_users (
    platform_user_id,
    virtual_user_id,
    ws_id
  )
  values (target_user_id, new_workspace_user_id, target_ws_id);

  return new_workspace_user_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.ensure_workspace_user_link(uuid, uuid)
  to authenticated;
