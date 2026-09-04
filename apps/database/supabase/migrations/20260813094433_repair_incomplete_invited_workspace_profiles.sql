-- Workspace invitation acceptance inserts workspace_members. The historical
-- trigger skipped link creation whenever users.display_name was null, which is
-- normal for newly registered accounts. Keep the callable repair RPC and the
-- insert trigger on one hardened implementation, then repair every valid
-- membership that was left without a workspace-scoped profile.

create or replace function public.ensure_workspace_user_link(
  target_user_id uuid,
  target_ws_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  existing_virtual_user_id uuid;
  matching_workspace_user_count integer := 0;
  matching_workspace_user_id uuid;
  new_workspace_user_id uuid;
  user_display_name text;
  user_email text;
  user_exists boolean := false;
begin
  -- Serialize trigger, backfill, and request-time repair calls for one member.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(':', target_ws_id::text, target_user_id::text),
      81428
    )
  );

  -- Authenticated callers may repair only their own link. A membership trigger
  -- is already guarded by the workspace_members insert policy, while service
  -- role maintenance has no auth.uid().
  if caller_id is not null
    and caller_id <> target_user_id
    and pg_catalog.pg_trigger_depth() = 0
  then
    raise exception 'Cannot repair another user workspace link'
      using errcode = '42501';
  end if;

  select link.virtual_user_id
  into existing_virtual_user_id
  from public.workspace_user_linked_users link
  where link.platform_user_id = target_user_id
    and link.ws_id = target_ws_id;

  if existing_virtual_user_id is not null then
    return existing_virtual_user_id;
  end if;

  if not exists (
    select 1
    from public.workspace_members member
    where member.user_id = target_user_id
      and member.ws_id = target_ws_id
  ) then
    raise exception 'User % is not a member of workspace %',
      target_user_id,
      target_ws_id;
  end if;

  select
    true,
    coalesce(
      nullif(pg_catalog.btrim(app_user.display_name), ''),
      nullif(pg_catalog.btrim(private_details.full_name), ''),
      nullif(pg_catalog.btrim(app_user.handle), ''),
      nullif(pg_catalog.btrim(private_details.email), ''),
      pg_catalog.format('User %s', pg_catalog.left(target_user_id::text, 8))
    ),
    nullif(
      pg_catalog.btrim(coalesce(private_details.email, '')),
      ''
    )
  into user_exists, user_display_name, user_email
  from public.users app_user
  left join public.user_private_details private_details
    on private_details.user_id = app_user.id
  where app_user.id = target_user_id;

  if user_exists is not true then
    raise exception 'User % not found', target_user_id;
  end if;

  if user_email is not null then
    select
      pg_catalog.count(*),
      (pg_catalog.array_agg(workspace_user.id order by workspace_user.id::text))[1]
    into matching_workspace_user_count, matching_workspace_user_id
    from public.workspace_users workspace_user
    where workspace_user.ws_id = target_ws_id
      and workspace_user.email is not null
      and pg_catalog.lower(pg_catalog.btrim(workspace_user.email)) =
        pg_catalog.lower(user_email)
      and not exists (
        select 1
        from public.workspace_user_linked_users claimed_link
        where claimed_link.virtual_user_id = workspace_user.id
      );
  end if;

  if matching_workspace_user_count = 1
    and matching_workspace_user_id is not null
  then
    new_workspace_user_id := matching_workspace_user_id;
  else
    new_workspace_user_id := extensions.gen_random_uuid();

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
$$;

revoke all on function public.ensure_workspace_user_link(uuid, uuid)
from public, anon;
grant execute on function public.ensure_workspace_user_link(uuid, uuid)
to authenticated, service_role;

create or replace function public.create_workspace_user_linked_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_workspace_user_link(new.user_id, new.ws_id);
  return new;
end;
$$;

revoke all on function public.create_workspace_user_linked_user()
from public, anon, authenticated, service_role;

-- The trigger already exists in every supported database. Recreate it here so
-- drifted environments converge on the hardened function explicitly.
drop trigger if exists create_workspace_user_linked_user
on public.workspace_members;

create trigger create_workspace_user_linked_user
after insert on public.workspace_members
for each row
execute function public.create_workspace_user_linked_user();

do $$
declare
  membership record;
  repaired_count integer := 0;
begin
  for membership in
    select member.user_id, member.ws_id
    from public.workspace_members member
    inner join public.users app_user on app_user.id = member.user_id
    where not exists (
      select 1
      from public.workspace_user_linked_users link
      where link.platform_user_id = member.user_id
        and link.ws_id = member.ws_id
    )
    order by member.ws_id, member.user_id
  loop
    perform public.ensure_workspace_user_link(
      membership.user_id,
      membership.ws_id
    );
    repaired_count := repaired_count + 1;
  end loop;

  raise notice 'Repaired % missing workspace-user membership links',
    repaired_count;
end;
$$;

comment on function public.ensure_workspace_user_link(uuid, uuid) is
  'Idempotently links a workspace member to a workspace profile, including incomplete platform profiles. Authenticated RPC callers may repair only themselves; the membership trigger and service role support controlled maintenance.';

comment on function public.create_workspace_user_linked_user() is
  'Creates the workspace-profile link required by profile-scoped modules whenever a workspace membership is inserted.';
