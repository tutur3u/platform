-- Add dynamic quiz fields to workspace_quizzes table
alter table "public"."workspace_quizzes" add column "type" text not null default 'multiple_choice';
alter table "public"."workspace_quizzes" add column "content" jsonb;
alter table "public"."workspace_quizzes" add column "answer" jsonb;
