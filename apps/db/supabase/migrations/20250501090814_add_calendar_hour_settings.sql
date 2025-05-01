create type "public"."calendar_hour_type" as enum ('WORK', 'PERSONAL', 'MEETING');

create table "public"."workspace_calendar_hour_settings" (
    "ws_id" uuid not null,
    "type" calendar_hour_type not null,
    "created_at" timestamp with time zone not null default now(),
    "data" jsonb not null
);


alter table "public"."workspace_calendar_hour_settings" enable row level security;

CREATE UNIQUE INDEX workspace_calendar_hour_settings_pkey ON public.workspace_calendar_hour_settings USING btree (ws_id, type);

alter table "public"."workspace_calendar_hour_settings" add constraint "workspace_calendar_hour_settings_pkey" PRIMARY KEY using index "workspace_calendar_hour_settings_pkey";

alter table "public"."workspace_calendar_hour_settings" add constraint "workspace_calendar_hour_settings_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_calendar_hour_settings" validate constraint "workspace_calendar_hour_settings_ws_id_fkey";

grant delete on table "public"."workspace_calendar_hour_settings" to "anon";

grant insert on table "public"."workspace_calendar_hour_settings" to "anon";

grant references on table "public"."workspace_calendar_hour_settings" to "anon";

grant select on table "public"."workspace_calendar_hour_settings" to "anon";

grant trigger on table "public"."workspace_calendar_hour_settings" to "anon";

grant truncate on table "public"."workspace_calendar_hour_settings" to "anon";

grant update on table "public"."workspace_calendar_hour_settings" to "anon";

grant delete on table "public"."workspace_calendar_hour_settings" to "authenticated";

grant insert on table "public"."workspace_calendar_hour_settings" to "authenticated";

grant references on table "public"."workspace_calendar_hour_settings" to "authenticated";

grant select on table "public"."workspace_calendar_hour_settings" to "authenticated";

grant trigger on table "public"."workspace_calendar_hour_settings" to "authenticated";

grant truncate on table "public"."workspace_calendar_hour_settings" to "authenticated";

grant update on table "public"."workspace_calendar_hour_settings" to "authenticated";

grant delete on table "public"."workspace_calendar_hour_settings" to "service_role";

grant insert on table "public"."workspace_calendar_hour_settings" to "service_role";

grant references on table "public"."workspace_calendar_hour_settings" to "service_role";

grant select on table "public"."workspace_calendar_hour_settings" to "service_role";

grant trigger on table "public"."workspace_calendar_hour_settings" to "service_role";

grant truncate on table "public"."workspace_calendar_hour_settings" to "service_role";

grant update on table "public"."workspace_calendar_hour_settings" to "service_role";


