-- 1. Handle workspace_course_modules dependencies
drop policy if exists "Allow all access for workspace member" on "public"."workspace_course_modules";
drop index if exists "public"."idx_workspace_course_modules_course_sort_key";
alter table "public"."workspace_course_modules" drop constraint if exists "workspace_course_modules_course_id_fkey";

-- 2. Drop course_id from workspace_course_modules
alter table "public"."workspace_course_modules" drop column if exists "course_id";

-- 3. Add group_id to workspace_course_modules
alter table "public"."workspace_course_modules" add column "group_id" uuid;
alter table "public"."workspace_course_modules" add constraint "workspace_course_modules_group_id_fkey" FOREIGN KEY (group_id) REFERENCES workspace_user_groups(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- 4. Create new sorted index for modules within a group
create index if not exists idx_workspace_course_modules_group_sort_key on public.workspace_course_modules (group_id, sort_key);

-- 5. Restore RLS for workspace_course_modules with group-based checks
create policy "Allow all access for workspace member"
on "public"."workspace_course_modules"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_user_groups wug
  WHERE (wug.id = workspace_course_modules.group_id AND is_org_member(auth.uid(), wug.ws_id)))))
with check ((EXISTS ( SELECT 1
   FROM workspace_user_groups wug
  WHERE (wug.id = workspace_course_modules.group_id AND is_org_member(auth.uid(), wug.ws_id)))));

-- 6. Handle course_certificates dependencies
alter table "public"."course_certificates" drop constraint if exists "course_certificates_course_id_fkey";
alter table "public"."course_certificates" drop constraint if exists "uq_user_certificate";
drop index if exists "public"."uq_user_certificate";

-- 7. Drop course_id from course_certificates
alter table "public"."course_certificates" drop column if exists "course_id";

-- 8. Add group_id to course_certificates
alter table "public"."course_certificates" add column "group_id" uuid;
alter table "public"."course_certificates" add constraint "course_certificates_group_id_fkey" FOREIGN KEY (group_id) REFERENCES workspace_user_groups(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- 9. Recreate unique index for certificates (one certificate per user per group)
CREATE UNIQUE INDEX uq_user_certificate ON public.course_certificates USING btree (user_id, group_id);
alter table "public"."course_certificates" add constraint "uq_user_certificate" UNIQUE using index "uq_user_certificate";

-- 10. Finally drop the now-redundant workspace_courses table
drop table if exists "public"."workspace_courses";
