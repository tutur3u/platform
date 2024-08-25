alter table "public"."workspace_users"
add column "display_name" text;
alter table "public"."workspace_users"
    rename column "name" to "full_name";