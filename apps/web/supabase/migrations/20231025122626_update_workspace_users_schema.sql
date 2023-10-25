alter table "public"."workspace_users"
add column "archived" boolean not null default false;
alter table "public"."workspace_users"
add column "archived_until" timestamp with time zone;
alter table "public"."workspace_users"
add column "created_by" uuid;
alter table "public"."workspace_users"
add constraint "workspace_users_created_by_fkey" FOREIGN KEY (created_by) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE
SET DEFAULT not valid;
alter table "public"."workspace_users" validate constraint "workspace_users_created_by_fkey";