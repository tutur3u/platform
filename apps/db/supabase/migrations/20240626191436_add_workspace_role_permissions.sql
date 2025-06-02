create type "public"."workspace_role_permission" as enum ('manage_workspace_roles', 'manage_workspace_members', 'manage_workspace_invites', 'manage_workspace_settings', 'manage_workspace_integrations', 'manage_workspace_billing', 'manage_workspace_security', 'manage_workspace_audit_logs', 'ai_chat');

create table "public"."workspace_role_permissions" (
    "ws_id" uuid not null,
    "permission" workspace_role_permission not null,
    "enabled" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "role_id" uuid not null
);

alter table "public"."workspace_role_permissions" enable row level security;

CREATE UNIQUE INDEX workspace_role_permissions_pkey ON public.workspace_role_permissions USING btree (ws_id, permission, role_id);

alter table "public"."workspace_role_permissions" add constraint "workspace_role_permissions_pkey" PRIMARY KEY using index "workspace_role_permissions_pkey";

alter table "public"."workspace_role_permissions" add constraint "public_workspace_role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES workspace_roles(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_role_permissions" validate constraint "public_workspace_role_permissions_role_id_fkey";

alter table "public"."workspace_role_permissions" add constraint "public_workspace_role_permissions_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_role_permissions" validate constraint "public_workspace_role_permissions_ws_id_fkey";

set check_function_bodies = off;

grant delete on table "public"."workspace_role_permissions" to "anon";

grant insert on table "public"."workspace_role_permissions" to "anon";

grant references on table "public"."workspace_role_permissions" to "anon";

grant select on table "public"."workspace_role_permissions" to "anon";

grant trigger on table "public"."workspace_role_permissions" to "anon";

grant truncate on table "public"."workspace_role_permissions" to "anon";

grant update on table "public"."workspace_role_permissions" to "anon";

grant delete on table "public"."workspace_role_permissions" to "authenticated";

grant insert on table "public"."workspace_role_permissions" to "authenticated";

grant references on table "public"."workspace_role_permissions" to "authenticated";

grant select on table "public"."workspace_role_permissions" to "authenticated";

grant trigger on table "public"."workspace_role_permissions" to "authenticated";

grant truncate on table "public"."workspace_role_permissions" to "authenticated";

grant update on table "public"."workspace_role_permissions" to "authenticated";

grant delete on table "public"."workspace_role_permissions" to "service_role";

grant insert on table "public"."workspace_role_permissions" to "service_role";

grant references on table "public"."workspace_role_permissions" to "service_role";

grant select on table "public"."workspace_role_permissions" to "service_role";

grant trigger on table "public"."workspace_role_permissions" to "service_role";

grant truncate on table "public"."workspace_role_permissions" to "service_role";

grant update on table "public"."workspace_role_permissions" to "service_role";

create policy "Allow workspace owners to have full permissions"
on "public"."workspace_role_permissions"
as permissive
for all
to authenticated
using ((get_user_role(auth.uid(), ws_id) = 'OWNER'::text))
with check ((get_user_role(auth.uid(), ws_id) = 'OWNER'::text));