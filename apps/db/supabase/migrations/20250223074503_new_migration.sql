alter table "public"."nova_users_problem_history" drop column "problemId";

alter table "public"."nova_users_problem_history" add column "problem_id" text;


