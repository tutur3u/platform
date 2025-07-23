create table "public"."calendar_sync_dashboard" (
    "id" uuid not null default gen_random_uuid(),
    "time" timestamp with time zone not null default now(),
    "ws_id" uuid not null,
    "triggered_by" text not null,
    "starttime" timestamp with time zone,
    "endtime" timestamp with time zone,
    "type" text check (type in ('active', 'manual', 'background')),
    "source" text,
    "status" text check (status in ('completed', 'failed', 'running')),
    "events_inserted" integer default 0,
    "events_updated" integer default 0,
    "events_deleted" integer default 0
);

alter table "public"."calendar_sync_dashboard" enable row level security;

CREATE UNIQUE INDEX calendar_sync_dashboard_pkey ON public.calendar_sync_dashboard USING btree (id);

CREATE INDEX calendar_sync_dashboard_ws_id_idx ON public.calendar_sync_dashboard USING btree (ws_id);

CREATE INDEX calendar_sync_dashboard_time_idx ON public.calendar_sync_dashboard USING btree (time);

CREATE INDEX calendar_sync_dashboard_status_idx ON public.calendar_sync_dashboard USING btree (status);

CREATE INDEX calendar_sync_dashboard_triggered_by_idx ON public.calendar_sync_dashboard USING btree (triggered_by);

alter table "public"."calendar_sync_dashboard" add constraint "calendar_sync_dashboard_pkey" PRIMARY KEY using index "calendar_sync_dashboard_pkey";

alter table "public"."calendar_sync_dashboard" add constraint "calendar_sync_dashboard_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."calendar_sync_dashboard" add constraint "calendar_sync_dashboard_triggered_by_check" CHECK (triggered_by = 'system' OR triggered_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

alter table "public"."calendar_sync_dashboard" validate constraint "calendar_sync_dashboard_ws_id_fkey";

-- Function to validate triggered_by references a valid user when not 'system'
CREATE OR REPLACE FUNCTION validate_triggered_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.triggered_by != 'system' THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id::text = NEW.triggered_by) THEN
      RAISE EXCEPTION 'triggered_by must reference a valid user or be "system"';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate triggered_by on insert/update
CREATE TRIGGER validate_triggered_by_trigger
  BEFORE INSERT OR UPDATE ON calendar_sync_dashboard
  FOR EACH ROW
  EXECUTE FUNCTION validate_triggered_by();

grant delete on table "public"."calendar_sync_dashboard" to "anon";

grant insert on table "public"."calendar_sync_dashboard" to "anon";

grant references on table "public"."calendar_sync_dashboard" to "anon";

grant select on table "public"."calendar_sync_dashboard" to "anon";

grant trigger on table "public"."calendar_sync_dashboard" to "anon";

grant truncate on table "public"."calendar_sync_dashboard" to "anon";

grant update on table "public"."calendar_sync_dashboard" to "anon";

grant delete on table "public"."calendar_sync_dashboard" to "authenticated";

grant insert on table "public"."calendar_sync_dashboard" to "authenticated";

grant references on table "public"."calendar_sync_dashboard" to "authenticated";

grant select on table "public"."calendar_sync_dashboard" to "authenticated";

grant trigger on table "public"."calendar_sync_dashboard" to "authenticated";

grant truncate on table "public"."calendar_sync_dashboard" to "authenticated";

grant update on table "public"."calendar_sync_dashboard" to "authenticated";

grant delete on table "public"."calendar_sync_dashboard" to "service_role";

grant insert on table "public"."calendar_sync_dashboard" to "service_role";

grant references on table "public"."calendar_sync_dashboard" to "service_role";

grant select on table "public"."calendar_sync_dashboard" to "service_role";

grant trigger on table "public"."calendar_sync_dashboard" to "service_role";

grant truncate on table "public"."calendar_sync_dashboard" to "service_role";

grant update on table "public"."calendar_sync_dashboard" to "service_role";

create policy "Enable read access for workspace members"
on "public"."calendar_sync_dashboard"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));

create policy "Enable insert access for workspace members"
on "public"."calendar_sync_dashboard"
as permissive
for insert
to authenticated
with check (is_org_member(auth.uid(), ws_id) AND (triggered_by = auth.uid()::text));

create policy "Enable update access for workspace members"
on "public"."calendar_sync_dashboard"
as permissive
for update
to authenticated
using (is_org_member(auth.uid(), ws_id) AND (triggered_by = auth.uid()::text));

create policy "Enable delete access for workspace members"
on "public"."calendar_sync_dashboard"
as permissive
for delete
to authenticated
using (is_org_member(auth.uid(), ws_id)); 