revoke delete on table "public"."nova_submission_highest_score" from "anon";

revoke insert on table "public"."nova_submission_highest_score" from "anon";

revoke references on table "public"."nova_submission_highest_score" from "anon";

revoke select on table "public"."nova_submission_highest_score" from "anon";

revoke trigger on table "public"."nova_submission_highest_score" from "anon";

revoke truncate on table "public"."nova_submission_highest_score" from "anon";

revoke update on table "public"."nova_submission_highest_score" from "anon";

revoke delete on table "public"."nova_submission_highest_score" from "authenticated";

revoke insert on table "public"."nova_submission_highest_score" from "authenticated";

revoke references on table "public"."nova_submission_highest_score" from "authenticated";

revoke select on table "public"."nova_submission_highest_score" from "authenticated";

revoke trigger on table "public"."nova_submission_highest_score" from "authenticated";

revoke truncate on table "public"."nova_submission_highest_score" from "authenticated";

revoke update on table "public"."nova_submission_highest_score" from "authenticated";

revoke delete on table "public"."nova_submission_highest_score" from "service_role";

revoke insert on table "public"."nova_submission_highest_score" from "service_role";

revoke references on table "public"."nova_submission_highest_score" from "service_role";

revoke select on table "public"."nova_submission_highest_score" from "service_role";

revoke trigger on table "public"."nova_submission_highest_score" from "service_role";

revoke truncate on table "public"."nova_submission_highest_score" from "service_role";

revoke update on table "public"."nova_submission_highest_score" from "service_role";

alter table "public"."nova_submission_highest_score" drop constraint "nova_submission_highest_score_problem_id_fkey";

alter table "public"."nova_submission_highest_score" drop constraint "nova_submission_highest_score_user_id_fkey";

alter table "public"."nova_submission_highest_score" drop constraint "nova_submission_highest_score_pkey";

drop index if exists "public"."nova_submission_highest_score_pkey";

drop table "public"."nova_submission_highest_score";


