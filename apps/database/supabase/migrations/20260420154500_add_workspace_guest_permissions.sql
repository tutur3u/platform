do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'workspace_guest_permission_t'
  ) then
    create type "public"."workspace_guest_permission_t" as enum (
      'course:view',
      'course:complete'
    );
  end if;
end $$;

create table "public"."workspace_guests" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "ws_id" uuid not null,
    "user_id" uuid not null,
    constraint "workspace_guests_pkey" primary key ("id"),
    constraint "workspace_guests_ws_id_user_id_key" unique ("ws_id", "user_id")
);

alter table "public"."workspace_guests" enable row level security;

alter table "public"."workspace_guests" add constraint "workspace_guests_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_guests" validate constraint "workspace_guests_ws_id_fkey";

alter table "public"."workspace_guests" add constraint "workspace_guests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_guests" validate constraint "workspace_guests_user_id_fkey";

create index "workspace_guests_ws_id_idx" on "public"."workspace_guests" using btree (ws_id);

create index "workspace_guests_user_id_idx" on "public"."workspace_guests" using btree (user_id);

grant delete on table "public"."workspace_guests" to "authenticated";
grant insert on table "public"."workspace_guests" to "authenticated";
grant select on table "public"."workspace_guests" to "authenticated";
grant update on table "public"."workspace_guests" to "authenticated";

grant delete on table "public"."workspace_guests" to "service_role";
grant insert on table "public"."workspace_guests" to "service_role";
grant select on table "public"."workspace_guests" to "service_role";
grant update on table "public"."workspace_guests" to "service_role";



create table "public"."workspace_guest_permissions" (
    "id" uuid not null default gen_random_uuid(),
    "guest_id" uuid not null,
    "permission" "public"."workspace_guest_permission_t" not null,
    "enable" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "resource_id" uuid,
    constraint "workspace_guest_permissions_pkey" primary key ("id")
);

alter table "public"."workspace_guest_permissions" enable row level security;

alter table "public"."workspace_guest_permissions" add constraint "workspace_guest_permissions_guest_id_fkey" FOREIGN KEY (guest_id) REFERENCES workspace_guests(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_guest_permissions" validate constraint "workspace_guest_permissions_guest_id_fkey";

create index "workspace_guest_permissions_guest_id_idx" on "public"."workspace_guest_permissions" using btree (guest_id);
create unique index "ux_workspace_guest_perm_global"
  on "public"."workspace_guest_permissions" using btree (guest_id, permission)
  where resource_id is null;
create unique index "ux_workspace_guest_perm_resource"
  on "public"."workspace_guest_permissions" using btree (guest_id, permission, resource_id)
  where resource_id is not null;

grant delete on table "public"."workspace_guest_permissions" to "authenticated";
grant insert on table "public"."workspace_guest_permissions" to "authenticated";
grant select on table "public"."workspace_guest_permissions" to "authenticated";
grant update on table "public"."workspace_guest_permissions" to "authenticated";

grant delete on table "public"."workspace_guest_permissions" to "service_role";
grant insert on table "public"."workspace_guest_permissions" to "service_role";
grant select on table "public"."workspace_guest_permissions" to "service_role";
grant update on table "public"."workspace_guest_permissions" to "service_role";

create policy "Workspace members can manage workspace guests"
on "public"."workspace_guests"
as permissive
for all
to authenticated
using (is_org_member(auth.uid(), ws_id))
with check (is_org_member(auth.uid(), ws_id));

create policy "Workspace members can manage workspace guest permissions"
on "public"."workspace_guest_permissions"
as permissive
for all
to authenticated
using (
  exists (
    select 1
    from "public"."workspace_guests" wg
    where wg.id = "workspace_guest_permissions"."guest_id"
      and is_org_member(auth.uid(), wg.ws_id)
  )
)
with check (
  exists (
    select 1
    from "public"."workspace_guests" wg
    where wg.id = "workspace_guest_permissions"."guest_id"
      and is_org_member(auth.uid(), wg.ws_id)
  )
);
