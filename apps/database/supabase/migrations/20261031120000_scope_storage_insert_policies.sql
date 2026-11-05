begin;
set local lock_timeout = '5s';

-- Workspace uploads retain their scoped client policies. Other uploads use
-- admin clients or server-issued tickets.
drop policy if exists "Enable insert for authenticated users only" on storage.objects;
drop policy if exists "Enable insert for authenticated users only" on storage.buckets;
drop policy if exists "Allow creators to upload to their inquiry folder" on storage.objects;
drop policy if exists "Root workspace members can upload changelog media" on storage.objects;
drop policy if exists "Root workspace members can update changelog media" on storage.objects;
drop policy if exists "Root workspace members can delete changelog media" on storage.objects;

drop policy if exists storage_buckets_server_insert_only on storage.buckets;
create policy storage_buckets_server_insert_only on storage.buckets
as restrictive for insert to anon, authenticated
with check (false);

drop policy if exists storage_client_bucket_insert on storage.objects;
create policy storage_client_bucket_insert on storage.objects
as restrictive for insert to anon, authenticated
with check (bucket_id = 'workspaces');

drop policy if exists storage_server_artifacts_insert on storage.objects;
create policy storage_server_artifacts_insert on storage.objects
as restrictive for insert to anon, authenticated
with check (bucket_id not in ('devbox-code-archives', 'devbox-run-artifacts'));

drop policy if exists storage_server_artifacts_update on storage.objects;
create policy storage_server_artifacts_update on storage.objects
as restrictive for update to anon, authenticated
using (bucket_id not in ('devbox-code-archives', 'devbox-run-artifacts'))
with check (bucket_id not in ('devbox-code-archives', 'devbox-run-artifacts'));

drop policy if exists storage_server_artifacts_delete on storage.objects;
create policy storage_server_artifacts_delete on storage.objects
as restrictive for delete to anon, authenticated
using (bucket_id not in ('devbox-code-archives', 'devbox-run-artifacts'));

drop policy if exists storage_changelog_staff_insert on storage.objects;
create policy storage_changelog_staff_insert on storage.objects
as restrictive for insert to anon, authenticated
with check (bucket_id <> 'changelog');

drop policy if exists storage_changelog_staff_update on storage.objects;
create policy storage_changelog_staff_update on storage.objects
as restrictive for update to anon, authenticated
using (bucket_id <> 'changelog')
with check (bucket_id <> 'changelog');

drop policy if exists storage_changelog_staff_delete on storage.objects;
create policy storage_changelog_staff_delete on storage.objects
as restrictive for delete to anon, authenticated
using (bucket_id <> 'changelog');

-- tuturuuu: reviewed(alter-routine-review): pins audit function search_path with pg_catalog first and pg_temp last; bodies are schema-qualified
alter function audit.insert_update_delete_trigger()
  set search_path = pg_catalog, public, audit, pg_temp;
-- tuturuuu: reviewed(alter-routine-review): pins audit function search_path with pg_catalog first and pg_temp last; bodies are schema-qualified
alter function audit.find_workspace_user_status_audit_record(uuid, uuid, boolean, timestamptz, uuid, timestamptz)
  set search_path = pg_catalog, public, audit, pg_temp;
-- tuturuuu: reviewed(alter-routine-review): pins audit function search_path with pg_catalog first and pg_temp last; bodies are schema-qualified
alter function audit.link_workspace_user_status_audit_record()
  set search_path = pg_catalog, public, audit, pg_temp;
commit;
