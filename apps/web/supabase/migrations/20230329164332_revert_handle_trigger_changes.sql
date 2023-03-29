drop trigger if exists "update_handle_trigger" on "public"."users";
alter table "public"."users" drop constraint "users_handle_fkey";
drop function if exists "public"."update_handle"();