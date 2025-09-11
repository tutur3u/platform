drop trigger if exists "trg_handle_task_tags" on "public"."tasks";

drop trigger if exists "normalize_board_tags_before_insert_update" on "public"."workspace_boards";

alter table "public"."tasks" drop constraint "check_max_tags";

alter table "public"."tasks" drop constraint "check_tags_not_empty_strings";

alter table "public"."workspace_boards" drop constraint "workspace_boards_tags_is_array";

alter table "public"."workspace_boards" drop constraint "workspace_boards_valid_tags";

drop function if exists "public"."add_board_tags"(board_id uuid, new_tags text[]);

drop function if exists "public"."get_board_task_tags"(board_id uuid);

drop function if exists "public"."handle_task_tags"();

drop function if exists "public"."normalize_board_tags_trigger"();

drop function if exists "public"."normalize_task_tags"(tags text[]);

drop function if exists "public"."remove_board_tags"(board_id uuid, tags_to_remove text[]);

drop function if exists "public"."search_boards_by_tags"(workspace_id uuid, search_tags text[], match_all boolean);

drop function if exists "public"."search_tasks_by_tags"(search_tags text[]);

drop function if exists "public"."validate_and_normalize_board_tags"(tags jsonb);

drop function if exists "public"."validate_board_tags"(tags jsonb);

drop view if exists "public"."time_tracking_session_analytics";

drop index if exists "public"."idx_tasks_tags";

drop index if exists "public"."idx_workspace_boards_tags";

drop index if exists "public"."idx_workspace_boards_tags_path";

alter table "public"."task_labels" drop column "created_at";

alter table "public"."tasks" drop column "tags";

alter table "public"."workspace_boards" drop column "tags";

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



