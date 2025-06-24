create type "public"."calendar_task_time" as enum ('working_time', 'personal_time');

create type "public"."priority_status" as enum ('low', 'medium', 'high', 'critical');

create table "public"."workspace_calendar_tasks" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "ws_id" uuid not null,
    "creator_id" uuid not null,
    "updated_at" timestamp with time zone,
    "is_splittable" boolean,
    "name" text,
    "min_split_duration_minutes" smallint,
    "max_split_duration_minutes" smallint,
    "schedule_after" timestamp with time zone,
    "due_date" timestamp with time zone,
    "time_reference" calendar_task_time default 'working_time'::calendar_task_time,
    "user_defined_priority" priority_status default 'medium'::priority_status,
    "evaluated_priority" priority_status default 'medium'::priority_status
);


alter table "public"."workspace_calendar_tasks" enable row level security;

CREATE UNIQUE INDEX workspace_calendar_tasks_pkey ON public.workspace_calendar_tasks USING btree (id);

alter table "public"."workspace_calendar_tasks" add constraint "workspace_calendar_tasks_pkey" PRIMARY KEY using index "workspace_calendar_tasks_pkey";

alter table "public"."workspace_calendar_tasks" add constraint "workspace_calendar_tasks_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."workspace_calendar_tasks" validate constraint "workspace_calendar_tasks_creator_id_fkey";

alter table "public"."workspace_calendar_tasks" add constraint "workspace_calendar_tasks_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."workspace_calendar_tasks" validate constraint "workspace_calendar_tasks_ws_id_fkey";

grant delete on table "public"."workspace_calendar_tasks" to "anon";

grant insert on table "public"."workspace_calendar_tasks" to "anon";

grant references on table "public"."workspace_calendar_tasks" to "anon";

grant select on table "public"."workspace_calendar_tasks" to "anon";

grant trigger on table "public"."workspace_calendar_tasks" to "anon";

grant truncate on table "public"."workspace_calendar_tasks" to "anon";

grant update on table "public"."workspace_calendar_tasks" to "anon";

grant delete on table "public"."workspace_calendar_tasks" to "authenticated";

grant insert on table "public"."workspace_calendar_tasks" to "authenticated";

grant references on table "public"."workspace_calendar_tasks" to "authenticated";

grant select on table "public"."workspace_calendar_tasks" to "authenticated";

grant trigger on table "public"."workspace_calendar_tasks" to "authenticated";

grant truncate on table "public"."workspace_calendar_tasks" to "authenticated";

grant update on table "public"."workspace_calendar_tasks" to "authenticated";

grant delete on table "public"."workspace_calendar_tasks" to "service_role";

grant insert on table "public"."workspace_calendar_tasks" to "service_role";

grant references on table "public"."workspace_calendar_tasks" to "service_role";

grant select on table "public"."workspace_calendar_tasks" to "service_role";

grant trigger on table "public"."workspace_calendar_tasks" to "service_role";

grant truncate on table "public"."workspace_calendar_tasks" to "service_role";

grant update on table "public"."workspace_calendar_tasks" to "service_role";

alter table "public"."workspace_calendar_tasks" add column "description" text;

alter table "public"."workspace_calendar_tasks" add column "total_duration" text not null;

alter table "public"."workspace_calendar_tasks" alter column "max_split_duration_minutes" set data type real using "max_split_duration_minutes"::real;

alter table "public"."workspace_calendar_tasks" alter column "min_split_duration_minutes" set data type real using "min_split_duration_minutes"::real;

alter table "public"."workspace_calendar_tasks" enable row level security;

create policy "allow only user in the workspace to insert"
on "public"."workspace_calendar_tasks"
as permissive
for insert
to authenticated
with check (true);

alter table "public"."workspace_calendar_tasks" alter column "total_duration" set data type real using "total_duration"::real;

alter table "public"."workspace_calendar_tasks" alter column "updated_at" set default now();

alter table "public"."tasks" add column "is_splittable" boolean;

alter table "public"."tasks" add column "max_split_duration_minutes" real;

alter table "public"."tasks" add column "min_split_duration_minutes" real;

alter table "public"."tasks" add column "time_reference" calendar_task_time;

alter table "public"."tasks" add column "total_duration" real;

alter table "public"."tasks" add column "user_defined_priority" priority_status default 'medium'::priority_status;

alter table "public"."tasks" alter column "list_id" drop not null;

create or replace view "public"."time_tracking_session_analytics" as  SELECT tts.id,
    tts.ws_id,
    tts.user_id,
    tts.task_id,
    tts.category_id,
    tts.title,
    tts.description,
    tts.start_time,
    tts.end_time,
    tts.duration_seconds,
    tts.is_running,
    tts.tags,
    tts.created_at,
    tts.updated_at,
    tts.productivity_score,
    tts.was_resumed,
    ttc.name AS category_name,
    ttc.color AS category_color,
    t.name AS task_name,
    EXTRACT(hour FROM tts.start_time) AS start_hour,
    EXTRACT(dow FROM tts.start_time) AS day_of_week,
    date_trunc('day'::text, tts.start_time) AS session_date,
    date_trunc('week'::text, tts.start_time) AS session_week,
    date_trunc('month'::text, tts.start_time) AS session_month,
        CASE
            WHEN (tts.duration_seconds >= 7200) THEN 'long'::text
            WHEN (tts.duration_seconds >= 1800) THEN 'medium'::text
            WHEN (tts.duration_seconds >= 300) THEN 'short'::text
            ELSE 'micro'::text
        END AS session_length_category
   FROM ((time_tracking_sessions tts
     LEFT JOIN time_tracking_categories ttc ON ((tts.category_id = ttc.id)))
     LEFT JOIN tasks t ON ((tts.task_id = t.id)));