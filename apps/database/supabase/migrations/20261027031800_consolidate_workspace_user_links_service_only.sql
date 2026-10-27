-- Restrict the workspace profile link repair RPC to the service role.
--
-- consolidate_workspace_user_links() creates workspace_users rows and
-- workspace_user_linked_users links. Its only caller is
-- POST /api/v1/workspaces/[wsId]/consolidate-users, which confirms the actor is
-- the workspace creator and then calls the RPC with the service-role client.
--
-- This migration:
-- - keeps the repair logic unchanged;
-- - rejects any request identity other than service_role inside the function;
-- - pins search_path to pg_catalog, pg_temp (every relation is qualified);
-- - revokes EXECUTE from PUBLIC, anon and authenticated, keeping service_role.
--
-- Rollback: apps/database/rollbacks/20261027031800_consolidate_workspace_user_links_service_only.rollback.sql

create or replace function public.consolidate_workspace_user_links(
  target_ws_id uuid default null
)
returns table (
  platform_user_id uuid,
  ws_id uuid,
  action text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  rec record;
  new_workspace_user_id uuid;
  matching_workspace_user_count integer := 0;
  matching_workspace_user_id uuid;
  user_display_name text;
  user_email text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'consolidate_workspace_user_links requires the service role'
      using errcode = '42501';
  end if;

  for rec in
    select wm.user_id, wm.ws_id
    from public.workspace_members wm
    where (target_ws_id is null or wm.ws_id = target_ws_id)
      and not exists (
        select 1
        from public.workspace_user_linked_users wul
        where wul.platform_user_id = wm.user_id
          and wul.ws_id = wm.ws_id
      )
  loop
    matching_workspace_user_count := 0;
    matching_workspace_user_id := null;
    new_workspace_user_id := null;

    select u.display_name, nullif(trim(coalesce(upd.email, '')), '')
    into user_display_name, user_email
    from public.users u
    left join public.user_private_details upd on upd.user_id = u.id
    where u.id = rec.user_id;

    if user_display_name is null then
      continue;
    end if;

    if user_email is not null then
      select count(*), (array_agg(wu.id order by wu.id::text))[1]
      into matching_workspace_user_count, matching_workspace_user_id
      from public.workspace_users wu
      where wu.ws_id = rec.ws_id
        and wu.email is not null
        and lower(trim(wu.email)) = lower(user_email)
        and not exists (
          select 1
          from public.workspace_user_linked_users wul
          where wul.virtual_user_id = wu.id
        );
    end if;

    if matching_workspace_user_count = 1 and matching_workspace_user_id is not null then
      new_workspace_user_id := matching_workspace_user_id;
      action := 'linked_existing';
    else
      new_workspace_user_id := gen_random_uuid();
      action := 'created';

      insert into public.workspace_users (id, ws_id, display_name, email)
      values (new_workspace_user_id, rec.ws_id, user_display_name, coalesce(user_email, ''));
    end if;

    insert into public.workspace_user_linked_users (platform_user_id, virtual_user_id, ws_id)
    values (rec.user_id, new_workspace_user_id, rec.ws_id);

    platform_user_id := rec.user_id;
    ws_id := rec.ws_id;
    return next;
  end loop;
end;
$$;

revoke all on function public.consolidate_workspace_user_links(uuid)
from public, anon, authenticated;
grant execute on function public.consolidate_workspace_user_links(uuid)
to service_role;
