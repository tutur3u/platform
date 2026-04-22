-- 1. Add course fields to user groups before remapping legacy data.
alter table "public"."workspace_user_groups"
  add column if not exists "description" text;

alter table "public"."workspace_user_groups"
  add column if not exists "cert_template" certificate_templates not null default 'original'::certificate_templates;

-- 2. Materialize every course as a workspace user group before rewiring child rows.
insert into "public"."workspace_user_groups" (
  "id",
  "ws_id",
  "name",
  "description",
  "cert_template",
  "created_at",
  "is_guest"
)
select
  wc.id,
  wc.ws_id,
  wc.name,
  wc.description,
  wc.cert_template,
  wc.created_at,
  false
from "public"."workspace_courses" wc
on conflict ("id") do update
set
  "description" = excluded."description",
  "cert_template" = excluded."cert_template",
  "created_at" = coalesce("workspace_user_groups"."created_at", excluded."created_at");

-- 3. Rewire workspace_course_modules without dropping legacy mappings first.
drop policy if exists "Allow all access for workspace member" on "public"."workspace_course_modules";
drop index if exists "public"."idx_workspace_course_modules_course_sort_key";
alter table "public"."workspace_course_modules"
  drop constraint if exists "workspace_course_modules_group_id_fkey";
alter table "public"."workspace_course_modules"
  drop constraint if exists "workspace_course_modules_course_id_fkey";
alter table "public"."workspace_course_modules"
  add column if not exists "group_id" uuid;

update "public"."workspace_course_modules"
set "group_id" = "course_id"
where "group_id" is null;

do $$
begin
  if exists (
    select 1
    from "public"."workspace_course_modules"
    where "group_id" is null
  ) then
    raise exception 'workspace_course_modules.group_id backfill failed';
  end if;
end $$;

alter table "public"."workspace_course_modules"
  alter column "group_id" set not null;
alter table "public"."workspace_course_modules"
  add constraint "workspace_course_modules_group_id_fkey"
  foreign key ("group_id") references "public"."workspace_user_groups"("id")
  on update cascade
  on delete cascade
  not valid;
alter table "public"."workspace_course_modules"
  validate constraint "workspace_course_modules_group_id_fkey";
alter table "public"."workspace_course_modules"
  drop column if exists "course_id";

create index if not exists "idx_workspace_course_modules_group_sort_key"
  on "public"."workspace_course_modules" ("group_id", "sort_key");

create policy "Allow all access for workspace member"
on "public"."workspace_course_modules"
as permissive
for all
to authenticated
using (exists (
  select 1
  from "public"."workspace_user_groups" wug
  where wug.id = "workspace_course_modules"."group_id"
    and is_org_member(auth.uid(), wug.ws_id)
))
with check (exists (
  select 1
  from "public"."workspace_user_groups" wug
  where wug.id = "workspace_course_modules"."group_id"
    and is_org_member(auth.uid(), wug.ws_id)
));

-- 4. Rewire course_certificates before dropping legacy courses.
alter table "public"."course_certificates"
  drop constraint if exists "course_certificates_group_id_fkey";
alter table "public"."course_certificates"
  drop constraint if exists "course_certificates_course_id_fkey";
alter table "public"."course_certificates"
  drop constraint if exists "uq_user_certificate";
drop index if exists "public"."uq_user_certificate";

alter table "public"."course_certificates"
  add column if not exists "group_id" uuid;

update "public"."course_certificates"
set "group_id" = "course_id"
where "group_id" is null;

do $$
begin
  if exists (
    select 1
    from "public"."course_certificates"
    where "group_id" is null
  ) then
    raise exception 'course_certificates.group_id backfill failed';
  end if;
end $$;

alter table "public"."course_certificates"
  alter column "group_id" set not null;
alter table "public"."course_certificates"
  add constraint "course_certificates_group_id_fkey"
  foreign key ("group_id") references "public"."workspace_user_groups"("id")
  on update cascade
  on delete cascade
  not valid;
alter table "public"."course_certificates"
  validate constraint "course_certificates_group_id_fkey";
alter table "public"."course_certificates"
  drop column if exists "course_id";

create unique index "uq_user_certificate"
  on "public"."course_certificates" using btree ("user_id", "group_id");
alter table "public"."course_certificates"
  add constraint "uq_user_certificate" unique using index "uq_user_certificate";

-- 5. Drop the legacy table only after dependent rows have been preserved.
drop table if exists "public"."workspace_courses";
