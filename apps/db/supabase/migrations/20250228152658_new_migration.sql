alter table "public"."nova_challenge_status" alter column "challenge_id" set not null;

alter table "public"."nova_challenge_status" alter column "user_id" set not null;

alter table "public"."nova_challenges" alter column "title" set not null;

alter table "public"."nova_problem_constraints" alter column "problem_id" set not null;

alter table "public"."nova_problem_testcases" alter column "problem_id" set not null;

alter table "public"."nova_problems" alter column "challenge_id" set not null;

alter table "public"."nova_problems" alter column "title" set not null;

alter table "public"."nova_submissions" alter column "problem_id" set not null;

alter table "public"."nova_submissions" alter column "user_id" set not null;

alter table "public"."nova_submissions" alter column "user_prompt" set not null;


