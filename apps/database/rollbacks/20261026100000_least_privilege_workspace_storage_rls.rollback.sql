-- Rollback for 20261026100000_least_privilege_workspace_storage_rls.sql.
--
-- FAITHFUL variant. Restores the exact 20231004102905 policies: every
-- workspace MEMBER can select/insert/update/delete every `<wsId>/**` object in
-- the `workspaces` bucket, and the legacy WITH CHECK (true) insert policy again
-- lets non-members insert. This reopens the HIGH finding. Prefer
-- 20261026100000_least_privilege_workspace_storage_rls.incident-rollback.sql
-- unless exact prior behaviour is required. Run it in one transaction as an
-- approved incident action. It does not touch objects or data. Either rollback
-- can run from the forward state or from the other rollback's state.
--
-- Proven by apps/database/verification/workspace-storage-rls-rollback-roundtrip.sql.

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

create policy "Allow workspace members to delete items workspace folder"
  on storage.objects as permissive for delete to authenticated
  using (
    bucket_id = 'workspaces'::text
    and is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

create policy "Allow workspace members to update items in workspace folder"
  on storage.objects as permissive for update to authenticated
  using (
    bucket_id = 'workspaces'::text
    and is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'workspaces'::text
    and is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

create policy "Allow workspace members to upload to workspace folder"
  on storage.objects as permissive for insert to authenticated
  with check (
    bucket_id = 'workspaces'::text
    and is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

create policy "Allow workspace members to view workspace folder"
  on storage.objects as permissive for select to authenticated
  using (
    bucket_id = 'workspaces'::text
    and is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

drop function if exists workspace_storage.object_access(text, text, workspace_storage.actor_access);
drop function if exists workspace_storage.actor_access();
drop type if exists workspace_storage.actor_access;
drop schema if exists workspace_storage;

commit;
