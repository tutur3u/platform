begin;
set local lock_timeout = '5s';

-- Retain workspace and root-workspace changelog INSERT policies.
-- Inquiry uploads use server-issued tickets; their legacy client policy queries
-- a server-owned table and must not participate in other client bucket inserts.
-- Avatars and banners continue to require server-issued upload tickets.
drop policy if exists "Enable insert for authenticated users only" on storage.objects;
drop policy if exists "Enable insert for authenticated users only" on storage.buckets;

alter policy "Allow creators to upload to their inquiry folder"
on storage.objects to service_role;

create policy storage_buckets_server_insert_only on storage.buckets
as restrictive for insert to anon, authenticated with check (false);

create policy storage_server_artifacts_insert on storage.objects
as restrictive for insert to anon, authenticated
with check (bucket_id not in ('devbox-code-archives', 'devbox-run-artifacts'));

create policy storage_changelog_staff_insert on storage.objects
as restrictive for insert to anon, authenticated
with check (bucket_id <> 'changelog' or (
  auth.role() = 'authenticated' and exists (
    select 1 from public.workspace_members wm
    where wm.ws_id = '00000000-0000-0000-0000-000000000000'
      and wm.user_id = auth.uid()
  )
));

create policy storage_server_artifacts_update on storage.objects
as restrictive for update to anon, authenticated
using (bucket_id not in ('devbox-code-archives', 'devbox-run-artifacts'))
with check (bucket_id not in ('devbox-code-archives', 'devbox-run-artifacts'));

create policy storage_changelog_staff_update on storage.objects
as restrictive for update to anon, authenticated
using (bucket_id <> 'changelog' or (
  auth.role() = 'authenticated' and exists (
    select 1 from public.workspace_members wm
    where wm.ws_id = '00000000-0000-0000-0000-000000000000'
      and wm.user_id = auth.uid()
  )
))
with check (bucket_id <> 'changelog' or (
  auth.role() = 'authenticated' and exists (
    select 1 from public.workspace_members wm
    where wm.ws_id = '00000000-0000-0000-0000-000000000000'
      and wm.user_id = auth.uid()
  )
));

create policy storage_server_artifacts_delete on storage.objects
as restrictive for delete to anon, authenticated
using (bucket_id not in ('devbox-code-archives', 'devbox-run-artifacts'));

create policy storage_changelog_staff_delete on storage.objects
as restrictive for delete to anon, authenticated
using (bucket_id <> 'changelog' or (
  auth.role() = 'authenticated' and exists (
    select 1 from public.workspace_members wm
    where wm.ws_id = '00000000-0000-0000-0000-000000000000'
      and wm.user_id = auth.uid()
  )
));

alter function audit.insert_update_delete_trigger()
  set search_path = public, audit, pg_temp;
alter function audit.find_workspace_user_status_audit_record(uuid, uuid, boolean, timestamptz, uuid, timestamptz)
  set search_path = public, audit, pg_temp;
alter function audit.link_workspace_user_status_audit_record()
  set search_path = public, audit, pg_temp;
commit;
