alter table "public"."nova_problem_criteria_scores" alter column "score" set data type real using "score"::real;

alter table "public"."nova_problem_test_cases" add column "hidden" boolean not null default true;

alter table "public"."nova_problem_test_cases" add column "output" text not null;

alter table "public"."nova_sessions" alter column "total_score" set data type real using "total_score"::real;
