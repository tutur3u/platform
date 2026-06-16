alter table "public"."course_tests" add column "start_at" timestamp with time zone;
alter table "public"."course_tests" add column "duration_in_minutes" integer check ("duration_in_minutes" is null or ("duration_in_minutes" >= 1 and "duration_in_minutes" <= 1440));
