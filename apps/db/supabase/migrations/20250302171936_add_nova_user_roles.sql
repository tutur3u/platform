create table "public"."nova_roles" (
    "id" uuid not null default gen_random_uuid(),
    "email" text,
    "enabled" boolean,
    "is_admin" boolean,
    "created_at" timestamp with time zone not null default now()
);

alter table
    "public"."nova_roles" enable row level security;

CREATE UNIQUE INDEX nova_roles_pkey ON public.nova_roles USING btree (id);

alter table
    "public"."nova_roles"
add
    constraint "nova_roles_pkey" PRIMARY KEY using index "nova_roles_pkey";

grant delete on table "public"."nova_roles" to "anon";

grant
insert
    on table "public"."nova_roles" to "anon";

grant references on table "public"."nova_roles" to "anon";

grant
select
    on table "public"."nova_roles" to "anon";

grant trigger on table "public"."nova_roles" to "anon";

grant truncate on table "public"."nova_roles" to "anon";

grant
update
    on table "public"."nova_roles" to "anon";

grant delete on table "public"."nova_roles" to "authenticated";

grant
insert
    on table "public"."nova_roles" to "authenticated";

grant references on table "public"."nova_roles" to "authenticated";

grant
select
    on table "public"."nova_roles" to "authenticated";

grant trigger on table "public"."nova_roles" to "authenticated";

grant truncate on table "public"."nova_roles" to "authenticated";

grant
update
    on table "public"."nova_roles" to "authenticated";

grant delete on table "public"."nova_roles" to "service_role";

grant
insert
    on table "public"."nova_roles" to "service_role";

grant references on table "public"."nova_roles" to "service_role";

grant
select
    on table "public"."nova_roles" to "service_role";

grant trigger on table "public"."nova_roles" to "service_role";

grant truncate on table "public"."nova_roles" to "service_role";

grant
update
    on table "public"."nova_roles" to "service_role";