alter table "public"."workspace_quiz_attempts" add column "duration_seconds" integer;

alter table "public"."workspace_quiz_attempts" add column "submitted_at" timestamp with time zone not null default now();

alter table "public"."workspace_quiz_sets" add column "available_date" timestamp with time zone not null default now();

alter table "public"."workspace_quiz_sets" add column "explanation_mode" smallint not null default 0;

alter table "public"."workspace_quiz_sets" add column "instruction" jsonb;


