-- Create calendar_connections table to track which Google Calendars are synced for each workspace
create table "public"."calendar_connections" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "calendar_id" text not null,
    "calendar_name" text not null,
    "is_enabled" boolean not null default true,
    "color" text,
    "created_at" timestamp without time zone not null default now(),
    "updated_at" timestamp without time zone not null default now()
);

alter table "public"."calendar_connections" enable row level security;

CREATE UNIQUE INDEX calendar_connections_pkey ON public.calendar_connections USING btree (id);
CREATE UNIQUE INDEX calendar_connections_ws_id_calendar_id_key ON public.calendar_connections USING btree (ws_id, calendar_id);

alter table "public"."calendar_connections" add constraint "calendar_connections_pkey" PRIMARY KEY using index "calendar_connections_pkey";

alter table "public"."calendar_connections" add constraint "calendar_connections_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."calendar_connections" validate constraint "calendar_connections_ws_id_fkey";

-- Grant permissions
grant delete on table "public"."calendar_connections" to "anon";
grant insert on table "public"."calendar_connections" to "anon";
grant references on table "public"."calendar_connections" to "anon";
grant select on table "public"."calendar_connections" to "anon";
grant trigger on table "public"."calendar_connections" to "anon";
grant truncate on table "public"."calendar_connections" to "anon";
grant update on table "public"."calendar_connections" to "anon";

grant delete on table "public"."calendar_connections" to "authenticated";
grant insert on table "public"."calendar_connections" to "authenticated";
grant references on table "public"."calendar_connections" to "authenticated";
grant select on table "public"."calendar_connections" to "authenticated";
grant trigger on table "public"."calendar_connections" to "authenticated";
grant truncate on table "public"."calendar_connections" to "authenticated";
grant update on table "public"."calendar_connections" to "authenticated";

grant delete on table "public"."calendar_connections" to "service_role";
grant insert on table "public"."calendar_connections" to "service_role";
grant references on table "public"."calendar_connections" to "service_role";
grant select on table "public"."calendar_connections" to "service_role";
grant trigger on table "public"."calendar_connections" to "service_role";
grant truncate on table "public"."calendar_connections" to "service_role";
grant update on table "public"."calendar_connections" to "service_role";

-- Row Level Security Policies
-- Users can only manage calendar connections for workspaces they belong to
create policy "Allow select for workspace members"
on "public"."calendar_connections"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));

create policy "Allow insert for workspace members"
on "public"."calendar_connections"
as permissive
for insert
to authenticated
with check (is_org_member(auth.uid(), ws_id));

create policy "Allow update for workspace members"
on "public"."calendar_connections"
as permissive
for update
to authenticated
using (is_org_member(auth.uid(), ws_id))
with check (is_org_member(auth.uid(), ws_id));

create policy "Allow delete for workspace members"
on "public"."calendar_connections"
as permissive
for delete
to authenticated
using (is_org_member(auth.uid(), ws_id));

-- Function to automatically update updated_at timestamp
create or replace function update_calendar_connections_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to call the function before update
create trigger update_calendar_connections_updated_at
before update on calendar_connections
for each row
execute function update_calendar_connections_updated_at();
