alter table "public"."nova_problem_testcases" drop column "constraint_content";

alter table "public"."nova_problem_testcases" add column "testcase_content" text;


