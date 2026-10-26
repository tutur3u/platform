-- Least-privilege, path-scoped RLS for the `workspaces` Storage bucket.
--
-- Replaces the 20231004102905 policies that let every workspace member select,
-- insert, update and delete every `<wsId>/**` object directly through the
-- Supabase Storage API (including private AI chat attachments).
--
-- Object names are `<wsId>/<root>/...`. Every rule requires MEMBER membership
-- of `<wsId>`. Access per root:
--   chat/<chatId>/...                         (legacy AI chat attachments)
--   chats/ai/resources/<chatId>/...           (AI chat attachments)
--     select/delete: the ai_chats creator
--   chats/ai/resources/temp/<userId>/...      (pre-chat uploads)
--     select/delete: that user
--   any other chats/** (native Chat), external-apps/**,
--   "AI Agent Imports"/** (Chat imports), mira/images/** (Mira results),
--   recordings/** (Meetings), .tuturuuu/** (reserved)
--     no client access; owning server APIs use the service role
--   project-updates/**                        (request-scoped task route)
--     all operations
--   template-backgrounds/**
--     select: any member; writes follow Drive
--   everything else, including root-level files (Drive)
--     select: view_drive, manage_drive or admin (or workspace creator)
--     insert/update/delete: manage_drive or admin (or workspace creator)
-- Client inserts/updates into private roots are denied; uploads go through
-- server-issued signed upload URLs after an ownership check.
--
-- Performance: workspace_storage.actor_access() resolves the caller's
-- workspace and Drive permission sets once per statement (an InitPlan via
-- `(select ...)`), so each row costs only path parsing and array lookups
-- (plus one primary-key probe for chat attachment rows).
--
-- The helpers live in the `workspace_storage` schema, which is not exposed
-- through PostgREST, so object_access() cannot be called with a forged
-- context. RESTRICTIVE guards make these rules authoritative even though the
-- legacy `Enable insert for authenticated users only` policy
-- (WITH CHECK (true)) still exists for other buckets. service_role bypasses
-- RLS and keeps full access.
--
-- Rollbacks (apps/database/rollbacks/):
--   20261026100000_least_privilege_workspace_storage_rls.rollback.sql
--     faithful: restores the exact 20231004102905 policies
--   20261026100000_least_privilege_workspace_storage_rls.incident-rollback.sql
--     safer: member-only access without private roots or non-member inserts

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema if not exists workspace_storage;
revoke all on schema workspace_storage from public;
grant usage on schema workspace_storage to authenticated, service_role;

create type workspace_storage.actor_access as (
  user_id uuid,
  member_ws uuid[],
  view_ws uuid[],
  manage_ws uuid[]
);

-- Caller's MEMBER workspaces and Drive permission sets. Mirrors
-- public.has_workspace_permission(): creator, then MEMBER role/default
-- `admin`, then MEMBER role/default explicit grants.
create or replace function workspace_storage.actor_access()
returns workspace_storage.actor_access
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with actor as (
    select auth.uid() as user_id
  ),
  member as (
    select wm.ws_id
    from public.workspace_members wm, actor
    where wm.user_id = actor.user_id
      and wm.type = 'MEMBER'::public.workspace_member_type
  ),
  grants as (
    select wrp.ws_id, wrp.permission::text as permission
    from public.workspace_role_members wrm
    join public.workspace_role_permissions wrp on wrp.role_id = wrm.role_id
    join member on member.ws_id = wrp.ws_id
    cross join actor
    where wrm.user_id = actor.user_id and wrp.enabled
    union
    select wdp.ws_id, wdp.permission::text
    from public.workspace_default_permissions wdp
    join member on member.ws_id = wdp.ws_id
    where wdp.enabled
      and wdp.member_type = 'MEMBER'::public.workspace_member_type
    union
    select w.id, 'admin'
    from public.workspaces w
    join member on member.ws_id = w.id
    cross join actor
    where w.creator_id = actor.user_id
  )
  select row(
    (select user_id from actor),
    coalesce((select array_agg(ws_id) from member), '{}'),
    coalesce((select array_agg(distinct ws_id) from grants
      where permission in ('admin', 'view_drive', 'manage_drive')), '{}'),
    coalesce((select array_agg(distinct ws_id) from grants
      where permission in ('admin', 'manage_drive')), '{}')
  )::workspace_storage.actor_access
$$;

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

revoke all on function workspace_storage.actor_access() from public, anon;
revoke all on function workspace_storage.object_access(text, text, workspace_storage.actor_access)
  from public, anon;
grant execute on function workspace_storage.actor_access()
  to authenticated, service_role;
grant execute on function workspace_storage.object_access(text, text, workspace_storage.actor_access)
  to authenticated, service_role;

drop policy if exists "Allow workspace members to view workspace folder"
  on storage.objects;
drop policy if exists "Allow workspace members to upload to workspace folder"
  on storage.objects;
drop policy if exists "Allow workspace members to update items in workspace folder"
  on storage.objects;
drop policy if exists "Allow workspace members to delete items workspace folder"
  on storage.objects;
-- Left behind if this body is re-applied after the incident rollback.
drop policy if exists workspace_storage_incident_select on storage.objects;
drop policy if exists workspace_storage_incident_insert on storage.objects;
drop policy if exists workspace_storage_incident_update on storage.objects;
drop policy if exists workspace_storage_incident_delete on storage.objects;
drop policy if exists workspace_storage_incident_guard_insert on storage.objects;
drop policy if exists workspace_storage_incident_guard_update on storage.objects;

create policy workspace_storage_select on storage.objects
  as permissive for select to authenticated
  using (
    bucket_id = 'workspaces'
    and workspace_storage.object_access(
      name, 'select', (select workspace_storage.actor_access()))
  );

create policy workspace_storage_insert on storage.objects
  as permissive for insert to authenticated
  with check (
    bucket_id = 'workspaces'
    and workspace_storage.object_access(
      name, 'insert', (select workspace_storage.actor_access()))
  );

create policy workspace_storage_update on storage.objects
  as permissive for update to authenticated
  using (
    bucket_id = 'workspaces'
    and workspace_storage.object_access(
      name, 'update', (select workspace_storage.actor_access()))
  )
  with check (
    bucket_id = 'workspaces'
    and workspace_storage.object_access(
      name, 'update', (select workspace_storage.actor_access()))
  );

create policy workspace_storage_delete on storage.objects
  as permissive for delete to authenticated
  using (
    bucket_id = 'workspaces'
    and workspace_storage.object_access(
      name, 'delete', (select workspace_storage.actor_access()))
  );

-- Guards: no other permissive policy can widen access to this bucket.
-- CASE evaluates the cheap bucket check first, so other buckets never call
-- the helper.
create policy workspace_storage_guard_select on storage.objects
  as restrictive for select to authenticated
  using (
    case when bucket_id is distinct from 'workspaces' then true
    else workspace_storage.object_access(
      name, 'select', (select workspace_storage.actor_access()))
    end
  );

create policy workspace_storage_guard_insert on storage.objects
  as restrictive for insert to authenticated
  with check (
    case when bucket_id is distinct from 'workspaces' then true
    else workspace_storage.object_access(
      name, 'insert', (select workspace_storage.actor_access()))
    end
  );

create policy workspace_storage_guard_update on storage.objects
  as restrictive for update to authenticated
  using (
    case when bucket_id is distinct from 'workspaces' then true
    else workspace_storage.object_access(
      name, 'update', (select workspace_storage.actor_access()))
    end
  )
  with check (
    case when bucket_id is distinct from 'workspaces' then true
    else workspace_storage.object_access(
      name, 'update', (select workspace_storage.actor_access()))
    end
  );

create policy workspace_storage_guard_delete on storage.objects
  as restrictive for delete to authenticated
  using (
    case when bucket_id is distinct from 'workspaces' then true
    else workspace_storage.object_access(
      name, 'delete', (select workspace_storage.actor_access()))
    end
  );

commit;
