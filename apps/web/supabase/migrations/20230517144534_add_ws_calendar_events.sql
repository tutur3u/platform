create table "public"."calendar_event_colors" ("value" text not null);
insert into "public"."calendar_event_colors" (value)
values ('RED'),
    ('BLUE'),
    ('GREEN'),
    ('YELLOW'),
    ('ORANGE'),
    ('PURPLE'),
    ('PINK'),
    ('INDIGO'),
    ('CYAN'),
    ('GRAY');
alter table "public"."calendar_event_colors" enable row level security;
create table "public"."workspace_calendar_events" (
    "id" uuid not null default gen_random_uuid(),
    "title" text not null default ''::text,
    "description" text not null default ''::text,
    "start_at" timestamp with time zone not null,
    "end_at" timestamp with time zone not null,
    "color" text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."workspace_calendar_events" enable row level security;
CREATE UNIQUE INDEX calendar_event_colors_pkey ON public.calendar_event_colors USING btree (value);
CREATE UNIQUE INDEX workspace_calendar_events_pkey ON public.workspace_calendar_events USING btree (id);
alter table "public"."calendar_event_colors"
add constraint "calendar_event_colors_pkey" PRIMARY KEY using index "calendar_event_colors_pkey";
alter table "public"."workspace_calendar_events"
add constraint "workspace_calendar_events_pkey" PRIMARY KEY using index "workspace_calendar_events_pkey";
alter table "public"."workspace_calendar_events"
add constraint "workspace_calendar_events_color_fkey" FOREIGN KEY (color) REFERENCES calendar_event_colors(value) ON DELETE
SET DEFAULT not valid;
alter table "public"."workspace_calendar_events" validate constraint "workspace_calendar_events_color_fkey";
alter table "public"."workspace_calendar_events"
add constraint "workspace_calendar_events_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;
alter table "public"."workspace_calendar_events" validate constraint "workspace_calendar_events_ws_id_fkey";
create policy "Enable read access for authenticated users" on "public"."calendar_event_colors" as permissive for
select to authenticated using (true);
create policy "Enable all access for workspace users" on "public"."workspace_calendar_events" as permissive for all to authenticated using (
    (
        EXISTS (
            SELECT 1
            FROM workspaces w
            WHERE (w.id = workspace_calendar_events.ws_id)
        )
    )
) with check (
    (
        EXISTS (
            SELECT 1
            FROM workspaces w
            WHERE (w.id = workspace_calendar_events.ws_id)
        )
    )
);