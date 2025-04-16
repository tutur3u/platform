drop policy " Enable all access for challenge manager" on "public"."nova_submission_outputs";

revoke delete on table "public"."nova_submission_outputs" from "anon";

revoke insert on table "public"."nova_submission_outputs" from "anon";

revoke references on table "public"."nova_submission_outputs" from "anon";

revoke select on table "public"."nova_submission_outputs" from "anon";

revoke trigger on table "public"."nova_submission_outputs" from "anon";

revoke truncate on table "public"."nova_submission_outputs" from "anon";

revoke update on table "public"."nova_submission_outputs" from "anon";

revoke delete on table "public"."nova_submission_outputs" from "authenticated";

revoke insert on table "public"."nova_submission_outputs" from "authenticated";

revoke references on table "public"."nova_submission_outputs" from "authenticated";

revoke select on table "public"."nova_submission_outputs" from "authenticated";

revoke trigger on table "public"."nova_submission_outputs" from "authenticated";

revoke truncate on table "public"."nova_submission_outputs" from "authenticated";

revoke update on table "public"."nova_submission_outputs" from "authenticated";

revoke delete on table "public"."nova_submission_outputs" from "service_role";

revoke insert on table "public"."nova_submission_outputs" from "service_role";

revoke references on table "public"."nova_submission_outputs" from "service_role";

revoke select on table "public"."nova_submission_outputs" from "service_role";

revoke trigger on table "public"."nova_submission_outputs" from "service_role";

revoke truncate on table "public"."nova_submission_outputs" from "service_role";

revoke update on table "public"."nova_submission_outputs" from "service_role";

alter table "public"."nova_submission_outputs" drop constraint "nova_submission_outputs_submission_id_fkey";

alter table "public"."nova_submission_outputs" drop constraint "nova_submission_outputs_pkey";

drop index if exists "public"."nova_submission_outputs_pkey";

drop table "public"."nova_submission_outputs";

alter table "public"."nova_problem_criteria_scores" alter column "score" set data type real using "score"::real;

alter table "public"."nova_problem_test_cases" add column "hidden" boolean not null default true;

alter table "public"."nova_problem_test_cases" add column "output" text not null;

alter table "public"."nova_sessions" alter column "total_score" set data type real using "total_score"::real;
