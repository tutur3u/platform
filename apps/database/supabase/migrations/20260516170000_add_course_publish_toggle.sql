alter table "public"."workspace_user_groups"
  add column if not exists "is_course_published" boolean not null default false;

update "public"."workspace_user_groups" as groups
set "is_course_published" = true
where coalesce(groups."is_guest", false) = false
  and exists (
    select 1
    from "public"."workspace_course_modules" as modules
    where modules."group_id" = groups."id"
      and modules."is_published" = true
  );

create index if not exists "idx_workspace_user_groups_course_publish"
  on "public"."workspace_user_groups" ("ws_id", "archived", "is_guest", "is_course_published");
