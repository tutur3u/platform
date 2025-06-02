create table "public"."workspace_configs" (
    "id" text not null,
    "value" text not null,
    "updated_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now(),
    "ws_id" uuid not null
);


alter table "public"."workspace_configs" enable row level security;

CREATE UNIQUE INDEX workspace_configs_pkey ON public.workspace_configs USING btree (id);

alter table "public"."workspace_configs" add constraint "workspace_configs_pkey" PRIMARY KEY using index "workspace_configs_pkey";

alter table "public"."workspace_configs" add constraint "public_workspace_configs_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_configs" validate constraint "public_workspace_configs_ws_id_fkey";

grant delete on table "public"."workspace_configs" to "anon";

grant insert on table "public"."workspace_configs" to "anon";

grant references on table "public"."workspace_configs" to "anon";

grant select on table "public"."workspace_configs" to "anon";

grant trigger on table "public"."workspace_configs" to "anon";

grant truncate on table "public"."workspace_configs" to "anon";

grant update on table "public"."workspace_configs" to "anon";

grant delete on table "public"."workspace_configs" to "authenticated";

grant insert on table "public"."workspace_configs" to "authenticated";

grant references on table "public"."workspace_configs" to "authenticated";

grant select on table "public"."workspace_configs" to "authenticated";

grant trigger on table "public"."workspace_configs" to "authenticated";

grant truncate on table "public"."workspace_configs" to "authenticated";

grant update on table "public"."workspace_configs" to "authenticated";

grant delete on table "public"."workspace_configs" to "service_role";

grant insert on table "public"."workspace_configs" to "service_role";

grant references on table "public"."workspace_configs" to "service_role";

grant select on table "public"."workspace_configs" to "service_role";

grant trigger on table "public"."workspace_configs" to "service_role";

grant truncate on table "public"."workspace_configs" to "service_role";

grant update on table "public"."workspace_configs" to "service_role";

create policy "Allow all for workspace admins and owners"
on "public"."workspace_configs"
as permissive
for all
to authenticated
using (((get_user_role(auth.uid(), ws_id) = 'ADMIN'::text) OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)))
with check (((get_user_role(auth.uid(), ws_id) = 'ADMIN'::text) OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)));



