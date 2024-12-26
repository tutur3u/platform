create table "public"."workspace_default_permissions" (
    "ws_id" uuid not null,
    "permission" workspace_role_permission not null,
    "enabled" boolean not null default false,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."workspace_default_permissions" enable row level security;

create table "public"."workspace_role_members" (
    "role_id" uuid not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."workspace_role_members" enable row level security;

CREATE UNIQUE INDEX workspace_default_permissions_pkey ON public.workspace_default_permissions USING btree (ws_id, permission);

CREATE UNIQUE INDEX workspace_role_members_pkey ON public.workspace_role_members USING btree (role_id, user_id);

alter table "public"."workspace_default_permissions" add constraint "workspace_default_permissions_pkey" PRIMARY KEY using index "workspace_default_permissions_pkey";

alter table "public"."workspace_role_members" add constraint "workspace_role_members_pkey" PRIMARY KEY using index "workspace_role_members_pkey";

alter table "public"."workspace_default_permissions" add constraint "public_workspace_default_permissions_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_default_permissions" validate constraint "public_workspace_default_permissions_ws_id_fkey";

alter table "public"."workspace_role_members" add constraint "public_workspace_role_members_role_id_fkey" FOREIGN KEY (role_id) REFERENCES workspace_roles(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_role_members" validate constraint "public_workspace_role_members_role_id_fkey";

alter table "public"."workspace_role_members" add constraint "public_workspace_role_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_role_members" validate constraint "public_workspace_role_members_user_id_fkey";

grant delete on table "public"."workspace_default_permissions" to "anon";

grant insert on table "public"."workspace_default_permissions" to "anon";

grant references on table "public"."workspace_default_permissions" to "anon";

grant select on table "public"."workspace_default_permissions" to "anon";

grant trigger on table "public"."workspace_default_permissions" to "anon";

grant truncate on table "public"."workspace_default_permissions" to "anon";

grant update on table "public"."workspace_default_permissions" to "anon";

grant delete on table "public"."workspace_default_permissions" to "authenticated";

grant insert on table "public"."workspace_default_permissions" to "authenticated";

grant references on table "public"."workspace_default_permissions" to "authenticated";

grant select on table "public"."workspace_default_permissions" to "authenticated";

grant trigger on table "public"."workspace_default_permissions" to "authenticated";

grant truncate on table "public"."workspace_default_permissions" to "authenticated";

grant update on table "public"."workspace_default_permissions" to "authenticated";

grant delete on table "public"."workspace_default_permissions" to "service_role";

grant insert on table "public"."workspace_default_permissions" to "service_role";

grant references on table "public"."workspace_default_permissions" to "service_role";

grant select on table "public"."workspace_default_permissions" to "service_role";

grant trigger on table "public"."workspace_default_permissions" to "service_role";

grant truncate on table "public"."workspace_default_permissions" to "service_role";

grant update on table "public"."workspace_default_permissions" to "service_role";

grant delete on table "public"."workspace_role_members" to "anon";

grant insert on table "public"."workspace_role_members" to "anon";

grant references on table "public"."workspace_role_members" to "anon";

grant select on table "public"."workspace_role_members" to "anon";

grant trigger on table "public"."workspace_role_members" to "anon";

grant truncate on table "public"."workspace_role_members" to "anon";

grant update on table "public"."workspace_role_members" to "anon";

grant delete on table "public"."workspace_role_members" to "authenticated";

grant insert on table "public"."workspace_role_members" to "authenticated";

grant references on table "public"."workspace_role_members" to "authenticated";

grant select on table "public"."workspace_role_members" to "authenticated";

grant trigger on table "public"."workspace_role_members" to "authenticated";

grant truncate on table "public"."workspace_role_members" to "authenticated";

grant update on table "public"."workspace_role_members" to "authenticated";

grant delete on table "public"."workspace_role_members" to "service_role";

grant insert on table "public"."workspace_role_members" to "service_role";

grant references on table "public"."workspace_role_members" to "service_role";

grant select on table "public"."workspace_role_members" to "service_role";

grant trigger on table "public"."workspace_role_members" to "service_role";

grant truncate on table "public"."workspace_role_members" to "service_role";

grant update on table "public"."workspace_role_members" to "service_role";

create policy "Allow workspace owners to have full permissions"
on "public"."workspace_default_permissions"
as permissive
for all
to authenticated
using ((get_user_role(auth.uid(), ws_id) = 'OWNER'::text))
with check ((get_user_role(auth.uid(), ws_id) = 'OWNER'::text));


create policy "Allow workspace owners to have full permissions"
on "public"."workspace_role_members"
as permissive
for all
to authenticated
using ((get_user_role(auth.uid(), ( SELECT wr.ws_id
   FROM workspace_roles wr
  WHERE (wr.id = workspace_role_members.role_id))) = 'OWNER'::text))
with check ((get_user_role(auth.uid(), ( SELECT wr.ws_id
   FROM workspace_roles wr
  WHERE (wr.id = workspace_role_members.role_id))) = 'OWNER'::text));