-- Rollback for 20261026192000_topic_announcements_private_storage_root.sql.
--
-- Restores the exact 20261026170000_least_privilege_workspace_storage_rls.sql
-- definition of workspace_storage.object_access(), which puts
-- `<wsId>/topic-announcements/**` back under the Drive rule (view_drive reads,
-- manage_drive writes). This reopens the MEDIUM finding; run it only as an
-- approved incident action, in one transaction. It does not touch policies,
-- grants, objects or data.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function workspace_storage.object_access(
  p_name text,
  p_operation text,
  p_actor workspace_storage.actor_access
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_parts text[];
  v_depth integer;
  v_ws uuid;
  v_root text;
  v_uuid_pattern constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_actor.user_id is null
    or p_name is null
    or p_operation not in ('select', 'insert', 'update', 'delete') then
    return false;
  end if;

  v_parts := pg_catalog.string_to_array(p_name, '/');
  v_depth := coalesce(pg_catalog.array_length(v_parts, 1), 0);

  -- Every object must live below a workspace folder; reject traversal-like
  -- or empty segments instead of guessing which root they belong to.
  if v_depth < 2 or v_parts[1] !~ v_uuid_pattern
    or '' = any(v_parts) or '.' = any(v_parts) or '..' = any(v_parts) then
    return false;
  end if;

  v_ws := v_parts[1]::uuid;
  if not (v_ws = any(p_actor.member_ws)) then
    return false;
  end if;

  -- Root-level files (`<wsId>/<file>`) are Drive objects.
  v_root := case when v_depth > 2 then pg_catalog.lower(v_parts[2]) end;

  -- Application-owned private roots: service role only.
  if v_root in ('external-apps', 'ai agent imports', 'recordings', '.tuturuuu')
    or (v_root = 'mira' and pg_catalog.lower(v_parts[3]) = 'images'
        and v_depth >= 4) then
    return false;
  end if;

  if v_root = 'chat' then
    return p_operation in ('select', 'delete')
      and v_depth >= 4
      and v_parts[3] ~ v_uuid_pattern
      and exists (
        select 1 from public.ai_chats c
        where c.id = v_parts[3]::uuid and c.creator_id = p_actor.user_id
      );
  end if;

  if v_root = 'chats' then
    if p_operation not in ('select', 'delete')
      or v_parts[3] is distinct from 'ai'
      or v_parts[4] is distinct from 'resources' then
      return false;
    end if;
    if v_parts[5] = 'temp' then
      return v_depth >= 7 and v_parts[6] = p_actor.user_id::text;
    end if;
    return v_depth >= 6
      and v_parts[5] ~ v_uuid_pattern
      and exists (
        select 1 from public.ai_chats c
        where c.id = v_parts[5]::uuid and c.creator_id = p_actor.user_id
      );
  end if;

  if v_root = 'project-updates' then
    return true;
  end if;

  if v_root = 'template-backgrounds' and p_operation = 'select' then
    return true;
  end if;

  if p_operation = 'select' then
    return v_ws = any(p_actor.view_ws);
  end if;

  return v_ws = any(p_actor.manage_ws);
end;
$$;

comment on function workspace_storage.object_access(text, text, workspace_storage.actor_access) is
  'RLS helper for the workspaces Storage bucket: path-scoped, least-privilege access. Private roots (chat, chats, external-apps, AI Agent Imports, mira/images, recordings, .tuturuuu) never fall back to Drive permissions. Pass (select workspace_storage.actor_access()) so permissions resolve once per statement.';

commit;
