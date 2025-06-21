create table "public"."workspace_roles" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "name" text not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."workspace_roles" enable row level security;

CREATE UNIQUE INDEX workspace_roles_pkey ON public.workspace_roles USING btree (id);

alter table "public"."workspace_roles" add constraint "workspace_roles_pkey" PRIMARY KEY using index "workspace_roles_pkey";

alter table "public"."workspace_roles" add constraint "public_workspace_roles_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_roles" validate constraint "public_workspace_roles_ws_id_fkey";

grant delete on table "public"."workspace_roles" to "anon";

grant insert on table "public"."workspace_roles" to "anon";

grant references on table "public"."workspace_roles" to "anon";

grant select on table "public"."workspace_roles" to "anon";

grant trigger on table "public"."workspace_roles" to "anon";

grant truncate on table "public"."workspace_roles" to "anon";

grant update on table "public"."workspace_roles" to "anon";

grant delete on table "public"."workspace_roles" to "authenticated";

grant insert on table "public"."workspace_roles" to "authenticated";

grant references on table "public"."workspace_roles" to "authenticated";

grant select on table "public"."workspace_roles" to "authenticated";

grant trigger on table "public"."workspace_roles" to "authenticated";

grant truncate on table "public"."workspace_roles" to "authenticated";

grant update on table "public"."workspace_roles" to "authenticated";

grant delete on table "public"."workspace_roles" to "service_role";

grant insert on table "public"."workspace_roles" to "service_role";

grant references on table "public"."workspace_roles" to "service_role";

grant select on table "public"."workspace_roles" to "service_role";

grant trigger on table "public"."workspace_roles" to "service_role";

grant truncate on table "public"."workspace_roles" to "service_role";

grant update on table "public"."workspace_roles" to "service_role";

create policy "Allow workspace owners to have full permissions"
on "public"."workspace_roles"
as permissive
for all
to authenticated
using ((get_user_role(auth.uid(), ws_id) = 'OWNER'::text))
with check ((get_user_role(auth.uid(), ws_id) = 'OWNER'::text));



