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

grant delete on table "public"."workspace_guests" to "anon";
grant insert on table "public"."workspace_guests" to "anon";
grant references on table "public"."workspace_guests" to "anon";
grant select on table "public"."workspace_guests" to "anon";
grant trigger on table "public"."workspace_guests" to "anon";
grant truncate on table "public"."workspace_guests" to "anon";
grant update on table "public"."workspace_guests" to "anon";

grant delete on table "public"."workspace_guests" to "authenticated";
grant insert on table "public"."workspace_guests" to "authenticated";
grant references on table "public"."workspace_guests" to "authenticated";
grant select on table "public"."workspace_guests" to "authenticated";
grant trigger on table "public"."workspace_guests" to "authenticated";
grant truncate on table "public"."workspace_guests" to "authenticated";
grant update on table "public"."workspace_guests" to "authenticated";

grant delete on table "public"."workspace_guests" to "service_role";
grant insert on table "public"."workspace_guests" to "service_role";
grant references on table "public"."workspace_guests" to "service_role";
grant select on table "public"."workspace_guests" to "service_role";
grant trigger on table "public"."workspace_guests" to "service_role";
grant truncate on table "public"."workspace_guests" to "service_role";
grant update on table "public"."workspace_guests" to "service_role";



create table "public"."workspace_guest_permissions" (
    "id" uuid not null default gen_random_uuid(),
    "guest_id" uuid not null,
    "permission" text not null,
    "enable" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "resource_id" uuid,
    constraint "workspace_guest_permissions_pkey" primary key ("id")
);

alter table "public"."workspace_guest_permissions" enable row level security;

alter table "public"."workspace_guest_permissions" add constraint "workspace_guest_permissions_guest_id_fkey" FOREIGN KEY (guest_id) REFERENCES workspace_guests(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_guest_permissions" validate constraint "workspace_guest_permissions_guest_id_fkey";

create index "workspace_guest_permissions_guest_id_idx" on "public"."workspace_guest_permissions" using btree (guest_id);

grant delete on table "public"."workspace_guest_permissions" to "anon";
grant insert on table "public"."workspace_guest_permissions" to "anon";
grant references on table "public"."workspace_guest_permissions" to "anon";
grant select on table "public"."workspace_guest_permissions" to "anon";
grant trigger on table "public"."workspace_guest_permissions" to "anon";
grant truncate on table "public"."workspace_guest_permissions" to "anon";
grant update on table "public"."workspace_guest_permissions" to "anon";

grant delete on table "public"."workspace_guest_permissions" to "authenticated";
grant insert on table "public"."workspace_guest_permissions" to "authenticated";
grant references on table "public"."workspace_guest_permissions" to "authenticated";
grant select on table "public"."workspace_guest_permissions" to "authenticated";
grant trigger on table "public"."workspace_guest_permissions" to "authenticated";
grant truncate on table "public"."workspace_guest_permissions" to "authenticated";
grant update on table "public"."workspace_guest_permissions" to "authenticated";

grant delete on table "public"."workspace_guest_permissions" to "service_role";
grant insert on table "public"."workspace_guest_permissions" to "service_role";
grant references on table "public"."workspace_guest_permissions" to "service_role";
grant select on table "public"."workspace_guest_permissions" to "service_role";
grant trigger on table "public"."workspace_guest_permissions" to "service_role";
grant truncate on table "public"."workspace_guest_permissions" to "service_role";
grant update on table "public"."workspace_guest_permissions" to "service_role";

-- Apply strict text limits if applicable (though we only have 'permission' text)
-- For now, let's just keep it simple as per request
