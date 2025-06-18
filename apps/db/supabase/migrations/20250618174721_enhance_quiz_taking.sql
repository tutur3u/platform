alter table "public"."workspace_quiz_attempts" add column "duration_seconds" integer;

alter table "public"."workspace_quiz_attempts" add column "submitted_at" timestamp with time zone not null default now();

alter table "public"."workspace_quiz_sets" add column "available_date" timestamp with time zone not null default now();

alter table "public"."workspace_quiz_sets" add column "explanation_mode" smallint not null default 0;

alter table "public"."workspace_quiz_sets" add column "instruction" jsonb;

alter table "public"."workspace_quizzes" add column "instruction" jsonb;

alter table "public"."workspace_quiz_sets" add column "results_released" boolean not null default false;

alter table "public"."workspace_quiz_sets" drop column "release_points_immediately";

alter table "public"."workspace_quiz_sets" add column "allow_view_old_attempts" boolean not null default true;