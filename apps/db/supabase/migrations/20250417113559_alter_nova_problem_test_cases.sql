alter table "public"."nova_problem_test_cases" add column "hidden" boolean not null default true;
alter table "public"."nova_problem_test_cases" add column "output" text not null;