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