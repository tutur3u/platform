alter table "public"."workspace_course_modules"
  add column if not exists "quiz_deadline" timestamp with time zone;
