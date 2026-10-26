-- INCIDENT (safer) rollback for
-- 20261026100000_least_privilege_workspace_storage_rls.sql.
--
-- Use when the path-scoped helper misbehaves (wrong denials, performance) and
-- Drive needs member-level access back quickly, without reopening the worst
-- parts of the original exposure:
--   - workspace MEMBERs get select/insert/update/delete on non-private
--     `<wsId>/**` objects (the 2023 Drive semantics, no view_drive check);
--   - private roots (chat, chats, external-apps, "AI Agent Imports",
--     mira/images, recordings, .tuturuuu) stay service-role only, so even
--     owners lose direct reads until the forward migration is re-applied;
--   - RESTRICTIVE insert/update guards keep the legacy WITH CHECK (true)
--     policy from letting non-members write the bucket.
-- It is plain SQL with no dependency on the workspace_storage helpers, which
-- it drops. It does not touch objects or data. Re-apply the forward migration
-- body once the cause is fixed.
--
-- Proven by apps/database/verification/workspace-storage-rls-incident-rollback.sql.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop policy if exists workspace_storage_guard_select on storage.objects;
drop policy if exists workspace_storage_guard_insert on storage.objects;
drop policy if exists workspace_storage_guard_update on storage.objects;
drop policy if exists workspace_storage_guard_delete on storage.objects;
drop policy if exists workspace_storage_select on storage.objects;
drop policy if exists workspace_storage_insert on storage.objects;
drop policy if exists workspace_storage_update on storage.objects;
drop policy if exists workspace_storage_delete on storage.objects;
drop policy if exists workspace_storage_incident_select on storage.objects;
drop policy if exists workspace_storage_incident_insert on storage.objects;
drop policy if exists workspace_storage_incident_update on storage.objects;
drop policy if exists workspace_storage_incident_delete on storage.objects;
drop policy if exists workspace_storage_incident_guard_insert on storage.objects;
drop policy if exists workspace_storage_incident_guard_update on storage.objects;
drop policy if exists "Allow workspace members to delete items workspace folder"
  on storage.objects;
drop policy if exists "Allow workspace members to update items in workspace folder"
  on storage.objects;
drop policy if exists "Allow workspace members to upload to workspace folder"
  on storage.objects;
drop policy if exists "Allow workspace members to view workspace folder"
  on storage.objects;

-- Member of the object's workspace and not a private root. CASE keeps the
-- uuid cast from running on malformed names.
create policy workspace_storage_incident_select on storage.objects
  as permissive for select to authenticated
  using (
    bucket_id = 'workspaces'
    and case
      when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
      when coalesce(lower((storage.foldername(name))[2]) in
        ('chat', 'chats', 'external-apps', 'ai agent imports', 'recordings', '.tuturuuu'), false) then false
      when coalesce(lower((storage.foldername(name))[2]) = 'mira'
        and lower((storage.foldername(name))[3]) = 'images', false) then false
      else public.is_org_member((select auth.uid()), ((storage.foldername(name))[1])::uuid)
    end
  );

create policy workspace_storage_incident_insert on storage.objects
  as permissive for insert to authenticated
  with check (
    bucket_id = 'workspaces'
    and case
      when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
      when coalesce(lower((storage.foldername(name))[2]) in
        ('chat', 'chats', 'external-apps', 'ai agent imports', 'recordings', '.tuturuuu'), false) then false
      when coalesce(lower((storage.foldername(name))[2]) = 'mira'
        and lower((storage.foldername(name))[3]) = 'images', false) then false
      else public.is_org_member((select auth.uid()), ((storage.foldername(name))[1])::uuid)
    end
  );

create policy workspace_storage_incident_update on storage.objects
  as permissive for update to authenticated
  using (
    bucket_id = 'workspaces'
    and case
      when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
      when coalesce(lower((storage.foldername(name))[2]) in
        ('chat', 'chats', 'external-apps', 'ai agent imports', 'recordings', '.tuturuuu'), false) then false
      when coalesce(lower((storage.foldername(name))[2]) = 'mira'
        and lower((storage.foldername(name))[3]) = 'images', false) then false
      else public.is_org_member((select auth.uid()), ((storage.foldername(name))[1])::uuid)
    end
  )
  with check (
    bucket_id = 'workspaces'
    and case
      when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
      when coalesce(lower((storage.foldername(name))[2]) in
        ('chat', 'chats', 'external-apps', 'ai agent imports', 'recordings', '.tuturuuu'), false) then false
      when coalesce(lower((storage.foldername(name))[2]) = 'mira'
        and lower((storage.foldername(name))[3]) = 'images', false) then false
      else public.is_org_member((select auth.uid()), ((storage.foldername(name))[1])::uuid)
    end
  );

create policy workspace_storage_incident_delete on storage.objects
  as permissive for delete to authenticated
  using (
    bucket_id = 'workspaces'
    and case
      when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
      when coalesce(lower((storage.foldername(name))[2]) in
        ('chat', 'chats', 'external-apps', 'ai agent imports', 'recordings', '.tuturuuu'), false) then false
      when coalesce(lower((storage.foldername(name))[2]) = 'mira'
        and lower((storage.foldername(name))[3]) = 'images', false) then false
      else public.is_org_member((select auth.uid()), ((storage.foldername(name))[1])::uuid)
    end
  );

-- Writes into this bucket must also pass the member/private-root rule, so
-- the legacy WITH CHECK (true) insert policy cannot widen them.
create policy workspace_storage_incident_guard_insert on storage.objects
  as restrictive for insert to authenticated
  with check (
    case
      when bucket_id is distinct from 'workspaces' then true
      when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
      when coalesce(lower((storage.foldername(name))[2]) in
        ('chat', 'chats', 'external-apps', 'ai agent imports', 'recordings', '.tuturuuu'), false) then false
      when coalesce(lower((storage.foldername(name))[2]) = 'mira'
        and lower((storage.foldername(name))[3]) = 'images', false) then false
      else public.is_org_member((select auth.uid()), ((storage.foldername(name))[1])::uuid)
    end
  );

create policy workspace_storage_incident_guard_update on storage.objects
  as restrictive for update to authenticated
  with check (
    case
      when bucket_id is distinct from 'workspaces' then true
      when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
      when coalesce(lower((storage.foldername(name))[2]) in
        ('chat', 'chats', 'external-apps', 'ai agent imports', 'recordings', '.tuturuuu'), false) then false
      when coalesce(lower((storage.foldername(name))[2]) = 'mira'
        and lower((storage.foldername(name))[3]) = 'images', false) then false
      else public.is_org_member((select auth.uid()), ((storage.foldername(name))[1])::uuid)
    end
  );

drop function if exists workspace_storage.object_access(text, text, workspace_storage.actor_access);
drop function if exists workspace_storage.actor_access();
drop type if exists workspace_storage.actor_access;
drop schema if exists workspace_storage;

commit;
