-- Least-privilege, path-scoped RLS for the `workspaces` Storage bucket.
--
-- Replaces the 20231004102905 policies that let every workspace member select,
-- insert, update and delete every `<wsId>/**` object directly through the
-- Supabase Storage API (including private AI chat attachments).
--
-- Object names are `<wsId>/<root>/...`. Access per root:
--   chat/<chatId>/...                         (legacy AI chat attachments)
--   chats/ai/resources/<chatId>/...           (AI chat attachments)
--     select/delete: the ai_chats creator, while a workspace MEMBER
--   chats/ai/resources/temp/<userId>/...      (pre-chat uploads)
--     select/delete: that user, while a workspace MEMBER
--   any other chats/** (native Chat), external-apps/**,
--   "AI Agent Imports"/** (Chat imports), mira/images/** (Mira results),
--   recordings/** (Meetings), .tuturuuu/** (reserved)
--     no client access; owning server APIs use the service role
--   project-updates/**                        (request-scoped task route)
--     all operations: workspace MEMBER (matches the owning app route)
--   template-backgrounds/**
--     select: workspace MEMBER; writes follow Drive
--   everything else, including root-level files (Drive)
--     select: MEMBER with view_drive or manage_drive
--     insert/update/delete: MEMBER with manage_drive
-- Client inserts/updates into private roots are denied; uploads go through
-- server-issued signed upload URLs after an ownership check.
--
-- RESTRICTIVE guards make these rules authoritative even though the legacy
-- `Enable insert for authenticated users only` policy (WITH CHECK (true))
-- still exists for other buckets. service_role bypasses RLS and keeps full
-- access. Rollback: apps/database/rollbacks/20261026100000_least_privilege_workspace_storage_rls.rollback.sql

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.workspace_storage_object_access(
  p_name text,
  p_operation text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_parts text[];
  v_depth integer;
  v_ws uuid;
  v_root text;
  v_uuid_pattern constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if v_user is null
    or p_name is null
    or p_operation not in ('select', 'insert', 'update', 'delete') then
    return false;
  end if;

  v_parts := pg_catalog.string_to_array(p_name, '/');
  v_depth := coalesce(pg_catalog.array_length(v_parts, 1), 0);

  -- Every object must live below a workspace folder; reject traversal-like
  -- or empty segments instead of guessing which root they belong to.
  if v_depth < 2 or v_parts[1] !~ v_uuid_pattern then
    return false;
  end if;
  if exists (
    select 1 from pg_catalog.unnest(v_parts) as segment
    where segment in ('', '.', '..')
  ) then
    return false;
  end if;

  v_ws := v_parts[1]::uuid;
  if not public.is_org_member(v_user, v_ws) then
    return false;
  end if;

  -- Root-level files (`<wsId>/<file>`) are Drive objects.
  v_root := case when v_depth > 2 then pg_catalog.lower(v_parts[2]) end;

  if v_root = 'chat' then
    return p_operation in ('select', 'delete')
      and v_depth >= 4
      and v_parts[3] ~ v_uuid_pattern
      and exists (
        select 1 from public.ai_chats c
        where c.id = v_parts[3]::uuid and c.creator_id = v_user
      );
  end if;

  if v_root = 'chats' then
    if p_operation not in ('select', 'delete')
      or v_parts[3] is distinct from 'ai'
      or v_parts[4] is distinct from 'resources' then
      return false;
    end if;
    if v_parts[5] = 'temp' then
      return v_depth >= 7 and v_parts[6] = v_user::text;
    end if;
    return v_depth >= 6
      and v_parts[5] ~ v_uuid_pattern
      and exists (
        select 1 from public.ai_chats c
        where c.id = v_parts[5]::uuid and c.creator_id = v_user
      );
  end if;

  -- Application-owned private roots: service role only.
  if v_root in ('external-apps', 'ai agent imports', 'recordings', '.tuturuuu')
    or (v_root = 'mira' and pg_catalog.lower(v_parts[3]) = 'images'
        and v_depth >= 4) then
    return false;
  end if;

  if v_root = 'project-updates' then
    return true;
  end if;

  if v_root = 'template-backgrounds' and p_operation = 'select' then
    return true;
  end if;

  if p_operation = 'select' then
    return public.has_workspace_permission(v_ws, v_user, 'view_drive')
      or public.has_workspace_permission(v_ws, v_user, 'manage_drive');
  end if;

  return public.has_workspace_permission(v_ws, v_user, 'manage_drive');
end;
$$;

comment on function public.workspace_storage_object_access(text, text) is
  'RLS helper for the workspaces Storage bucket: path-scoped, least-privilege access for the calling user. Private roots (chat, chats, external-apps, AI Agent Imports, mira/images, recordings, .tuturuuu) never fall back to Drive permissions.';

revoke all on function public.workspace_storage_object_access(text, text)
  from public, anon;
grant execute on function public.workspace_storage_object_access(text, text)
  to authenticated, service_role;

drop policy if exists "Allow workspace members to view workspace folder"
  on storage.objects;
drop policy if exists "Allow workspace members to upload to workspace folder"
  on storage.objects;
drop policy if exists "Allow workspace members to update items in workspace folder"
  on storage.objects;
drop policy if exists "Allow workspace members to delete items workspace folder"
  on storage.objects;

create policy workspace_storage_select on storage.objects
  as permissive for select to authenticated
  using (
    bucket_id = 'workspaces'
    and public.workspace_storage_object_access(name, 'select')
  );

create policy workspace_storage_insert on storage.objects
  as permissive for insert to authenticated
  with check (
    bucket_id = 'workspaces'
    and public.workspace_storage_object_access(name, 'insert')
  );

create policy workspace_storage_update on storage.objects
  as permissive for update to authenticated
  using (
    bucket_id = 'workspaces'
    and public.workspace_storage_object_access(name, 'update')
  )
  with check (
    bucket_id = 'workspaces'
    and public.workspace_storage_object_access(name, 'update')
  );

create policy workspace_storage_delete on storage.objects
  as permissive for delete to authenticated
  using (
    bucket_id = 'workspaces'
    and public.workspace_storage_object_access(name, 'delete')
  );

-- Guards: no other permissive policy can widen access to this bucket.
create policy workspace_storage_guard_select on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id is distinct from 'workspaces'
    or public.workspace_storage_object_access(name, 'select')
  );

create policy workspace_storage_guard_insert on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id is distinct from 'workspaces'
    or public.workspace_storage_object_access(name, 'insert')
  );

create policy workspace_storage_guard_update on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id is distinct from 'workspaces'
    or public.workspace_storage_object_access(name, 'update')
  )
  with check (
    bucket_id is distinct from 'workspaces'
    or public.workspace_storage_object_access(name, 'update')
  );

create policy workspace_storage_guard_delete on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id is distinct from 'workspaces'
    or public.workspace_storage_object_access(name, 'delete')
  );
