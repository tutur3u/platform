create table "public"."workspace_user_group_tags" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "name" text not null,
    "color" text,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."workspace_user_group_tags" enable row level security;

CREATE UNIQUE INDEX workspace_user_group_tags_pkey ON public.workspace_user_group_tags USING btree (id);

alter table "public"."workspace_user_group_tags" add constraint "workspace_user_group_tags_pkey" PRIMARY KEY using index "workspace_user_group_tags_pkey";

alter table "public"."workspace_user_group_tags" add constraint "public_workspace_user_group_tags_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_user_group_tags" validate constraint "public_workspace_user_group_tags_ws_id_fkey";

grant delete on table "public"."workspace_user_group_tags" to "anon";

grant insert on table "public"."workspace_user_group_tags" to "anon";

grant references on table "public"."workspace_user_group_tags" to "anon";

grant select on table "public"."workspace_user_group_tags" to "anon";

grant trigger on table "public"."workspace_user_group_tags" to "anon";

grant truncate on table "public"."workspace_user_group_tags" to "anon";

grant update on table "public"."workspace_user_group_tags" to "anon";

grant delete on table "public"."workspace_user_group_tags" to "authenticated";

grant insert on table "public"."workspace_user_group_tags" to "authenticated";

grant references on table "public"."workspace_user_group_tags" to "authenticated";

grant select on table "public"."workspace_user_group_tags" to "authenticated";

grant trigger on table "public"."workspace_user_group_tags" to "authenticated";

grant truncate on table "public"."workspace_user_group_tags" to "authenticated";

grant update on table "public"."workspace_user_group_tags" to "authenticated";

grant delete on table "public"."workspace_user_group_tags" to "service_role";

grant insert on table "public"."workspace_user_group_tags" to "service_role";

grant references on table "public"."workspace_user_group_tags" to "service_role";

grant select on table "public"."workspace_user_group_tags" to "service_role";

grant trigger on table "public"."workspace_user_group_tags" to "service_role";

grant truncate on table "public"."workspace_user_group_tags" to "service_role";

grant update on table "public"."workspace_user_group_tags" to "service_role";

create policy "Enable all access for workspace admins"
on "public"."workspace_user_group_tags"
as permissive
for all
to authenticated
using (((get_user_role(auth.uid(), ws_id) = 'ADMIN'::text) OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)))
with check (((get_user_role(auth.uid(), ws_id) = 'ADMIN'::text) OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)));