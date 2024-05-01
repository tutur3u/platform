drop trigger if exists "audit_i_u_d" on "public"."workspace_presets";

drop trigger if exists "audit_t" on "public"."workspace_presets";

drop policy "Enable read access for authenticated users" on "public"."workspace_presets";

revoke delete on table "public"."workspace_presets" from "anon";

revoke insert on table "public"."workspace_presets" from "anon";

revoke references on table "public"."workspace_presets" from "anon";

revoke select on table "public"."workspace_presets" from "anon";

revoke trigger on table "public"."workspace_presets" from "anon";

revoke truncate on table "public"."workspace_presets" from "anon";

revoke update on table "public"."workspace_presets" from "anon";

revoke delete on table "public"."workspace_presets" from "authenticated";

revoke insert on table "public"."workspace_presets" from "authenticated";

revoke references on table "public"."workspace_presets" from "authenticated";

revoke select on table "public"."workspace_presets" from "authenticated";

revoke trigger on table "public"."workspace_presets" from "authenticated";

revoke truncate on table "public"."workspace_presets" from "authenticated";

revoke update on table "public"."workspace_presets" from "authenticated";

revoke delete on table "public"."workspace_presets" from "service_role";

revoke insert on table "public"."workspace_presets" from "service_role";

revoke references on table "public"."workspace_presets" from "service_role";

revoke select on table "public"."workspace_presets" from "service_role";

revoke trigger on table "public"."workspace_presets" from "service_role";

revoke truncate on table "public"."workspace_presets" from "service_role";

revoke update on table "public"."workspace_presets" from "service_role";

alter table "public"."workspaces" drop constraint "workspaces_preset_fkey";

alter table "public"."workspace_presets" drop constraint "workspace_presets_pkey";

drop index if exists "public"."workspace_presets_pkey";

drop table "public"."workspace_presets";

alter table "public"."workspaces" drop column "preset";


