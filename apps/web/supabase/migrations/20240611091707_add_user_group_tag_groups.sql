create table "public"."workspace_user_group_tag_groups" (
    "tag_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "group_id" uuid not null
);


alter table "public"."workspace_user_group_tag_groups" enable row level security;

CREATE UNIQUE INDEX workspace_user_group_tag_groups_pkey ON public.workspace_user_group_tag_groups USING btree (tag_id, group_id);

alter table "public"."workspace_user_group_tag_groups" add constraint "workspace_user_group_tag_groups_pkey" PRIMARY KEY using index "workspace_user_group_tag_groups_pkey";

alter table "public"."workspace_user_group_tag_groups" add constraint "public_workspace_user_group_tag_groups_group_id_fkey" FOREIGN KEY (group_id) REFERENCES workspace_user_groups(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_user_group_tag_groups" validate constraint "public_workspace_user_group_tag_groups_group_id_fkey";

alter table "public"."workspace_user_group_tag_groups" add constraint "public_workspace_user_group_tag_groups_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES workspace_user_group_tags(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_user_group_tag_groups" validate constraint "public_workspace_user_group_tag_groups_tag_id_fkey";

grant delete on table "public"."workspace_user_group_tag_groups" to "anon";

grant insert on table "public"."workspace_user_group_tag_groups" to "anon";

grant references on table "public"."workspace_user_group_tag_groups" to "anon";

grant select on table "public"."workspace_user_group_tag_groups" to "anon";

grant trigger on table "public"."workspace_user_group_tag_groups" to "anon";

grant truncate on table "public"."workspace_user_group_tag_groups" to "anon";

grant update on table "public"."workspace_user_group_tag_groups" to "anon";

grant delete on table "public"."workspace_user_group_tag_groups" to "authenticated";

grant insert on table "public"."workspace_user_group_tag_groups" to "authenticated";

grant references on table "public"."workspace_user_group_tag_groups" to "authenticated";

grant select on table "public"."workspace_user_group_tag_groups" to "authenticated";

grant trigger on table "public"."workspace_user_group_tag_groups" to "authenticated";

grant truncate on table "public"."workspace_user_group_tag_groups" to "authenticated";

grant update on table "public"."workspace_user_group_tag_groups" to "authenticated";

grant delete on table "public"."workspace_user_group_tag_groups" to "service_role";

grant insert on table "public"."workspace_user_group_tag_groups" to "service_role";

grant references on table "public"."workspace_user_group_tag_groups" to "service_role";

grant select on table "public"."workspace_user_group_tag_groups" to "service_role";

grant trigger on table "public"."workspace_user_group_tag_groups" to "service_role";

grant truncate on table "public"."workspace_user_group_tag_groups" to "service_role";

grant update on table "public"."workspace_user_group_tag_groups" to "service_role";

create policy "Enable all access for workspace admins"
on "public"."workspace_user_group_tag_groups"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_user_groups wug
  WHERE ((wug.id = workspace_user_group_tag_groups.group_id) AND ((get_user_role(auth.uid(), wug.ws_id) = 'ADMIN'::text) OR (get_user_role(auth.uid(), wug.ws_id) = 'OWNER'::text))))))
with check ((EXISTS ( SELECT 1
   FROM workspace_user_groups wug
  WHERE ((wug.id = workspace_user_group_tag_groups.group_id) AND ((get_user_role(auth.uid(), wug.ws_id) = 'ADMIN'::text) OR (get_user_role(auth.uid(), wug.ws_id) = 'OWNER'::text))))));