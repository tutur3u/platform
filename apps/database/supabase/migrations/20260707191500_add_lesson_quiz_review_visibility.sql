alter table "public"."workspace_course_modules"
  add column if not exists "is_quiz_score_published" boolean not null default false;

alter table "public"."course_module_quiz_submissions"
  alter column "is_correct" drop not null;

alter table "public"."course_module_quiz_submissions"
  add column if not exists "feedback" text;

update "public"."course_module_quiz_submissions" as submissions
set "is_correct" = null
from "public"."workspace_quizzes" as quizzes
where submissions."quiz_id" = quizzes."id"
  and quizzes."type" = 'paragraph';
