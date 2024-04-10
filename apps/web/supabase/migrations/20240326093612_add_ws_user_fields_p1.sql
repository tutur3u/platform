create table "public"."field_types" (
    "id" text not null,
    "enabled" boolean not null default true
);

insert into
    "public"."field_types" ("id", "enabled")
values
    ('TEXT', true),
    ('NUMBER', true),
    ('BOOLEAN', true),
    ('DATE', true),
    ('DATETIME', true);

alter table
    "public"."field_types" enable row level security;

create table "public"."workspace_user_fields" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "type" text not null,
    "possible_values" text [],
    "ws_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "description" text,
    "notes" text,
    "default_value" text
);

alter table
    "public"."workspace_user_fields" enable row level security;

CREATE UNIQUE INDEX field_types_pkey ON public.field_types USING btree (id);

CREATE UNIQUE INDEX workspace_user_fields_pkey ON public.workspace_user_fields USING btree (id);

alter table
    "public"."field_types"
add
    constraint "field_types_pkey" PRIMARY KEY using index "field_types_pkey";

alter table
    "public"."workspace_user_fields"
add
    constraint "workspace_user_fields_pkey" PRIMARY KEY using index "workspace_user_fields_pkey";

alter table
    "public"."workspace_user_fields"
add
    constraint "public_workspace_user_fields_type_fkey" FOREIGN KEY (type) REFERENCES field_types(id) not valid;

alter table
    "public"."workspace_user_fields" validate constraint "public_workspace_user_fields_type_fkey";

alter table
    "public"."workspace_user_fields"
add
    constraint "public_workspace_user_fields_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."workspace_user_fields" validate constraint "public_workspace_user_fields_ws_id_fkey";

grant delete on table "public"."field_types" to "anon";

grant
insert
    on table "public"."field_types" to "anon";

grant references on table "public"."field_types" to "anon";

grant
select
    on table "public"."field_types" to "anon";

grant trigger on table "public"."field_types" to "anon";

grant truncate on table "public"."field_types" to "anon";

grant
update
    on table "public"."field_types" to "anon";

grant delete on table "public"."field_types" to "authenticated";

grant
insert
    on table "public"."field_types" to "authenticated";

grant references on table "public"."field_types" to "authenticated";

grant
select
    on table "public"."field_types" to "authenticated";

grant trigger on table "public"."field_types" to "authenticated";

grant truncate on table "public"."field_types" to "authenticated";

grant
update
    on table "public"."field_types" to "authenticated";

grant delete on table "public"."field_types" to "service_role";

grant
insert
    on table "public"."field_types" to "service_role";

grant references on table "public"."field_types" to "service_role";

grant
select
    on table "public"."field_types" to "service_role";

grant trigger on table "public"."field_types" to "service_role";

grant truncate on table "public"."field_types" to "service_role";

grant
update
    on table "public"."field_types" to "service_role";

grant delete on table "public"."workspace_user_fields" to "anon";

grant
insert
    on table "public"."workspace_user_fields" to "anon";

grant references on table "public"."workspace_user_fields" to "anon";

grant
select
    on table "public"."workspace_user_fields" to "anon";

grant trigger on table "public"."workspace_user_fields" to "anon";

grant truncate on table "public"."workspace_user_fields" to "anon";

grant
update
    on table "public"."workspace_user_fields" to "anon";

grant delete on table "public"."workspace_user_fields" to "authenticated";

grant
insert
    on table "public"."workspace_user_fields" to "authenticated";

grant references on table "public"."workspace_user_fields" to "authenticated";

grant
select
    on table "public"."workspace_user_fields" to "authenticated";

grant trigger on table "public"."workspace_user_fields" to "authenticated";

grant truncate on table "public"."workspace_user_fields" to "authenticated";

grant
update
    on table "public"."workspace_user_fields" to "authenticated";

grant delete on table "public"."workspace_user_fields" to "service_role";

grant
insert
    on table "public"."workspace_user_fields" to "service_role";

grant references on table "public"."workspace_user_fields" to "service_role";

grant
select
    on table "public"."workspace_user_fields" to "service_role";

grant trigger on table "public"."workspace_user_fields" to "service_role";

grant truncate on table "public"."workspace_user_fields" to "service_role";

grant
update
    on table "public"."workspace_user_fields" to "service_role";

create policy "Allow all access for workspace members" on "public"."workspace_user_fields" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));