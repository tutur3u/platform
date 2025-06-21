create table "public"."workspace_email_credentials" (
    "id" uuid not null default gen_random_uuid(),
    "region" text not null default 'ap-southeast-1'::text,
    "access_id" text not null,
    "access_key" text not null,
    "source_name" text not null default 'Tuturuuu'::text,
    "source_email" text not null default 'notifications@tuturuuu.com'::text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."workspace_email_credentials" enable row level security;

CREATE UNIQUE INDEX workspace_email_credentials_pkey ON public.workspace_email_credentials USING btree (id);

alter table "public"."workspace_email_credentials" add constraint "workspace_email_credentials_pkey" PRIMARY KEY using index "workspace_email_credentials_pkey";

alter table "public"."workspace_email_credentials" add constraint "workspace_email_credentials_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_email_credentials" validate constraint "workspace_email_credentials_ws_id_fkey";

grant delete on table "public"."workspace_email_credentials" to "anon";

grant insert on table "public"."workspace_email_credentials" to "anon";

grant references on table "public"."workspace_email_credentials" to "anon";

grant select on table "public"."workspace_email_credentials" to "anon";

grant trigger on table "public"."workspace_email_credentials" to "anon";

grant truncate on table "public"."workspace_email_credentials" to "anon";

grant update on table "public"."workspace_email_credentials" to "anon";

grant delete on table "public"."workspace_email_credentials" to "authenticated";

grant insert on table "public"."workspace_email_credentials" to "authenticated";

grant references on table "public"."workspace_email_credentials" to "authenticated";

grant select on table "public"."workspace_email_credentials" to "authenticated";

grant trigger on table "public"."workspace_email_credentials" to "authenticated";

grant truncate on table "public"."workspace_email_credentials" to "authenticated";

grant update on table "public"."workspace_email_credentials" to "authenticated";

grant delete on table "public"."workspace_email_credentials" to "service_role";

grant insert on table "public"."workspace_email_credentials" to "service_role";

grant references on table "public"."workspace_email_credentials" to "service_role";

grant select on table "public"."workspace_email_credentials" to "service_role";

grant trigger on table "public"."workspace_email_credentials" to "service_role";

grant truncate on table "public"."workspace_email_credentials" to "service_role";

grant update on table "public"."workspace_email_credentials" to "service_role";

create policy "System access only"
on "public"."workspace_email_credentials"
as permissive
for all
to authenticated
using (false)
with check (false);



