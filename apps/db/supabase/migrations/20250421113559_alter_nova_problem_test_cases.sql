alter table "public"."nova_problem_test_cases" add column "hidden" boolean not null default true;
alter table "public"."nova_problem_test_cases" add column "output" text;
update "public"."nova_problem_test_cases" set "output" = '';
alter table "public"."nova_problem_test_cases" alter column "output" set not null;
