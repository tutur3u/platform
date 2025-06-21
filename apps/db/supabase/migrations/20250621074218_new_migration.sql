







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



