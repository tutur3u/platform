create table "public"."calendar_sync_dashboard" (
    "id" uuid not null default gen_random_uuid(),
    "updated_at" timestamp with time zone not null default now(),
    "ws_id" uuid not null,
    "triggered_by" uuid not null,
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "type" text check (type in ('active', 'manual', 'background')),
    "source" text,
    "status" text check (status in ('completed', 'failed', 'running')),
    "inserted_events" integer default 0,
    "updated_events" integer default 0,
    "deleted_events" integer default 0
);

alter table "public"."calendar_sync_dashboard" enable row level security;

CREATE UNIQUE INDEX calendar_sync_dashboard_pkey ON public.calendar_sync_dashboard USING btree (id);

CREATE INDEX calendar_sync_dashboard_ws_id_idx ON public.calendar_sync_dashboard USING btree (ws_id);

CREATE INDEX calendar_sync_dashboard_status_idx ON public.calendar_sync_dashboard USING btree (status);

CREATE INDEX calendar_sync_dashboard_triggered_by_idx ON public.calendar_sync_dashboard USING btree (triggered_by);

alter table "public"."calendar_sync_dashboard" add constraint "calendar_sync_dashboard_pkey" PRIMARY KEY using index "calendar_sync_dashboard_pkey";

alter table "public"."calendar_sync_dashboard" add constraint "calendar_sync_dashboard_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."calendar_sync_dashboard" add constraint "calendar_sync_dashboard_triggered_by_fkey" FOREIGN KEY (triggered_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."calendar_sync_dashboard" validate constraint "calendar_sync_dashboard_ws_id_fkey";

alter table "public"."calendar_sync_dashboard" validate constraint "calendar_sync_dashboard_triggered_by_fkey";

grant insert on table "public"."calendar_sync_dashboard" to "authenticated";

grant references on table "public"."calendar_sync_dashboard" to "authenticated";

grant select on table "public"."calendar_sync_dashboard" to "authenticated";

grant trigger on table "public"."calendar_sync_dashboard" to "authenticated";

grant update on table "public"."calendar_sync_dashboard" to "authenticated";

grant insert on table "public"."calendar_sync_dashboard" to "service_role";

grant references on table "public"."calendar_sync_dashboard" to "service_role";

grant select on table "public"."calendar_sync_dashboard" to "service_role";

grant trigger on table "public"."calendar_sync_dashboard" to "service_role";

grant update on table "public"."calendar_sync_dashboard" to "service_role";

create policy "Enable read access for workspace members"
on "public"."calendar_sync_dashboard"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));