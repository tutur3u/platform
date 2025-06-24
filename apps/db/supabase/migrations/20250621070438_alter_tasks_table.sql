drop policy "Users can view sync logs for their workspaces" on "public"."workspace_calendar_sync_log";

drop policy "Workspace members can read and write whiteboards" on "public"."workspace_whiteboards";

revoke delete on table "public"."workspace_calendar_sync_log" from "anon";

revoke insert on table "public"."workspace_calendar_sync_log" from "anon";

revoke references on table "public"."workspace_calendar_sync_log" from "anon";

revoke select on table "public"."workspace_calendar_sync_log" from "anon";

revoke trigger on table "public"."workspace_calendar_sync_log" from "anon";

revoke truncate on table "public"."workspace_calendar_sync_log" from "anon";

revoke update on table "public"."workspace_calendar_sync_log" from "anon";

revoke delete on table "public"."workspace_calendar_sync_log" from "authenticated";

revoke insert on table "public"."workspace_calendar_sync_log" from "authenticated";

revoke references on table "public"."workspace_calendar_sync_log" from "authenticated";

revoke select on table "public"."workspace_calendar_sync_log" from "authenticated";

revoke trigger on table "public"."workspace_calendar_sync_log" from "authenticated";

revoke truncate on table "public"."workspace_calendar_sync_log" from "authenticated";

revoke update on table "public"."workspace_calendar_sync_log" from "authenticated";

revoke delete on table "public"."workspace_calendar_sync_log" from "service_role";

revoke insert on table "public"."workspace_calendar_sync_log" from "service_role";

revoke references on table "public"."workspace_calendar_sync_log" from "service_role";

revoke select on table "public"."workspace_calendar_sync_log" from "service_role";

revoke trigger on table "public"."workspace_calendar_sync_log" from "service_role";

revoke truncate on table "public"."workspace_calendar_sync_log" from "service_role";

revoke update on table "public"."workspace_calendar_sync_log" from "service_role";

revoke delete on table "public"."workspace_whiteboards" from "anon";

revoke insert on table "public"."workspace_whiteboards" from "anon";

revoke references on table "public"."workspace_whiteboards" from "anon";

revoke select on table "public"."workspace_whiteboards" from "anon";

revoke trigger on table "public"."workspace_whiteboards" from "anon";

revoke truncate on table "public"."workspace_whiteboards" from "anon";

revoke update on table "public"."workspace_whiteboards" from "anon";

revoke delete on table "public"."workspace_whiteboards" from "authenticated";

revoke insert on table "public"."workspace_whiteboards" from "authenticated";

revoke references on table "public"."workspace_whiteboards" from "authenticated";

revoke select on table "public"."workspace_whiteboards" from "authenticated";

revoke trigger on table "public"."workspace_whiteboards" from "authenticated";

revoke truncate on table "public"."workspace_whiteboards" from "authenticated";

revoke update on table "public"."workspace_whiteboards" from "authenticated";

revoke delete on table "public"."workspace_whiteboards" from "service_role";

revoke insert on table "public"."workspace_whiteboards" from "service_role";

revoke references on table "public"."workspace_whiteboards" from "service_role";

revoke select on table "public"."workspace_whiteboards" from "service_role";

revoke trigger on table "public"."workspace_whiteboards" from "service_role";

revoke truncate on table "public"."workspace_whiteboards" from "service_role";

revoke update on table "public"."workspace_whiteboards" from "service_role";

alter table "public"."workspace_calendar_sync_log" drop constraint "workspace_calendar_sync_log_status_check";

alter table "public"."workspace_calendar_sync_log" drop constraint "workspace_calendar_sync_log_timestamps_check";

alter table "public"."workspace_calendar_sync_log" drop constraint "workspace_calendar_sync_log_triggered_by_check";

alter table "public"."workspace_calendar_sync_log" drop constraint "workspace_calendar_sync_log_ws_id_fkey";

alter table "public"."workspace_calendar_tasks" drop constraint "workspace_calendar_tasks_creator_id_fkey";

alter table "public"."workspace_calendar_tasks" drop constraint "workspace_calendar_tasks_ws_id_fkey";

alter table "public"."workspace_whiteboards" drop constraint "workspace_whiteboards_creator_id_fkey";

alter table "public"."workspace_whiteboards" drop constraint "workspace_whiteboards_ws_id_fkey";

drop view if exists "public"."time_tracking_session_analytics";

alter table "public"."workspace_calendar_sync_log" drop constraint "workspace_calendar_sync_log_pkey";

alter table "public"."workspace_calendar_tasks" drop constraint "workspace_calendar_tasks_pkey";

alter table "public"."workspace_whiteboards" drop constraint "workspace_whiteboards_pkey";

drop index if exists "public"."idx_whiteboards_creator_id";

drop index if exists "public"."idx_whiteboards_snapshot_gin";

drop index if exists "public"."idx_whiteboards_ws_id";

drop index if exists "public"."workspace_calendar_sync_log_pkey";

drop index if exists "public"."workspace_calendar_sync_log_status_idx";

drop index if exists "public"."workspace_calendar_sync_log_sync_started_at_idx";

drop index if exists "public"."workspace_calendar_sync_log_workspace_id_idx";

drop index if exists "public"."workspace_calendar_tasks_pkey";

drop index if exists "public"."workspace_whiteboards_pkey";

drop table "public"."workspace_calendar_sync_log";

drop table "public"."workspace_whiteboards";

alter table "public"."tasks" add column "is_splittable" boolean not null default true;

alter table "public"."tasks" add column "max_split_duration_minutes" real default '240'::real;

alter table "public"."tasks" add column "min_split_duration_minutes" real default '30'::real;

alter table "public"."tasks" add column "time_reference" calendar_task_time not null default 'working_time'::calendar_task_time;

alter table "public"."tasks" add column "total_duration" real;

alter table "public"."tasks" add column "user_defined_priority" priority_status default 'medium'::priority_status;




CREATE UNIQUE INDEX workspace_calendar_taskss_pkey ON public.workspace_calendar_tasks USING btree (id);

alter table "public"."workspace_calendar_tasks" add constraint "workspace_calendar_taskss_pkey" PRIMARY KEY using index "workspace_calendar_taskss_pkey";

alter table "public"."workspace_calendar_tasks" add constraint "workspace_calendar_tasks_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."workspace_calendar_tasks" validate constraint "workspace_calendar_tasks_creator_id_fkey";

alter table "public"."workspace_calendar_tasks" add constraint "workspace_calendar_tasks_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."workspace_calendar_tasks" validate constraint "workspace_calendar_tasks_ws_id_fkey";

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



alter table "public"."tasks" alter column "is_splittable" drop default;

alter table "public"."tasks" alter column "is_splittable" drop not null;

alter table "public"."tasks" alter column "max_split_duration_minutes" drop default;

alter table "public"."tasks" alter column "min_split_duration_minutes" drop default;

alter table "public"."tasks" alter column "time_reference" drop default;

alter table "public"."tasks" alter column "time_reference" drop not null;

