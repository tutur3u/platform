drop policy "Allow all for workspace members" on "public"."aurora_ml_forecast";

drop policy "Allow all for workspace members" on "public"."aurora_ml_metrics";

drop policy "Allow all for workspace members" on "public"."aurora_statistical_forecast";

drop policy "Allow all for workspace members" on "public"."aurora_statistical_metrics";

drop policy "Denies all requests" on "public"."crawled_url_next_urls";

drop policy "Denies all requests" on "public"."crawled_urls";

drop policy "Enable all access for current user" on "public"."nova_leaderboard";

drop policy "Enable all access for current user" on "public"."nova_test_timer_record";

drop policy "Enable all access for current user" on "public"."nova_users_problem_history";

revoke delete on table "public"."aurora_ml_forecast" from "anon";

revoke insert on table "public"."aurora_ml_forecast" from "anon";

revoke references on table "public"."aurora_ml_forecast" from "anon";

revoke select on table "public"."aurora_ml_forecast" from "anon";

revoke trigger on table "public"."aurora_ml_forecast" from "anon";

revoke truncate on table "public"."aurora_ml_forecast" from "anon";

revoke update on table "public"."aurora_ml_forecast" from "anon";

revoke delete on table "public"."aurora_ml_forecast" from "authenticated";

revoke insert on table "public"."aurora_ml_forecast" from "authenticated";

revoke references on table "public"."aurora_ml_forecast" from "authenticated";

revoke select on table "public"."aurora_ml_forecast" from "authenticated";

revoke trigger on table "public"."aurora_ml_forecast" from "authenticated";

revoke truncate on table "public"."aurora_ml_forecast" from "authenticated";

revoke update on table "public"."aurora_ml_forecast" from "authenticated";

revoke delete on table "public"."aurora_ml_forecast" from "service_role";

revoke insert on table "public"."aurora_ml_forecast" from "service_role";

revoke references on table "public"."aurora_ml_forecast" from "service_role";

revoke select on table "public"."aurora_ml_forecast" from "service_role";

revoke trigger on table "public"."aurora_ml_forecast" from "service_role";

revoke truncate on table "public"."aurora_ml_forecast" from "service_role";

revoke update on table "public"."aurora_ml_forecast" from "service_role";

revoke delete on table "public"."aurora_ml_metrics" from "anon";

revoke insert on table "public"."aurora_ml_metrics" from "anon";

revoke references on table "public"."aurora_ml_metrics" from "anon";

revoke select on table "public"."aurora_ml_metrics" from "anon";

revoke trigger on table "public"."aurora_ml_metrics" from "anon";

revoke truncate on table "public"."aurora_ml_metrics" from "anon";

revoke update on table "public"."aurora_ml_metrics" from "anon";

revoke delete on table "public"."aurora_ml_metrics" from "authenticated";

revoke insert on table "public"."aurora_ml_metrics" from "authenticated";

revoke references on table "public"."aurora_ml_metrics" from "authenticated";

revoke select on table "public"."aurora_ml_metrics" from "authenticated";

revoke trigger on table "public"."aurora_ml_metrics" from "authenticated";

revoke truncate on table "public"."aurora_ml_metrics" from "authenticated";

revoke update on table "public"."aurora_ml_metrics" from "authenticated";

revoke delete on table "public"."aurora_ml_metrics" from "service_role";

revoke insert on table "public"."aurora_ml_metrics" from "service_role";

revoke references on table "public"."aurora_ml_metrics" from "service_role";

revoke select on table "public"."aurora_ml_metrics" from "service_role";

revoke trigger on table "public"."aurora_ml_metrics" from "service_role";

revoke truncate on table "public"."aurora_ml_metrics" from "service_role";

revoke update on table "public"."aurora_ml_metrics" from "service_role";

revoke delete on table "public"."aurora_statistical_forecast" from "anon";

revoke insert on table "public"."aurora_statistical_forecast" from "anon";

revoke references on table "public"."aurora_statistical_forecast" from "anon";

revoke select on table "public"."aurora_statistical_forecast" from "anon";

revoke trigger on table "public"."aurora_statistical_forecast" from "anon";

revoke truncate on table "public"."aurora_statistical_forecast" from "anon";

revoke update on table "public"."aurora_statistical_forecast" from "anon";

revoke delete on table "public"."aurora_statistical_forecast" from "authenticated";

revoke insert on table "public"."aurora_statistical_forecast" from "authenticated";

revoke references on table "public"."aurora_statistical_forecast" from "authenticated";

revoke select on table "public"."aurora_statistical_forecast" from "authenticated";

revoke trigger on table "public"."aurora_statistical_forecast" from "authenticated";

revoke truncate on table "public"."aurora_statistical_forecast" from "authenticated";

revoke update on table "public"."aurora_statistical_forecast" from "authenticated";

revoke delete on table "public"."aurora_statistical_forecast" from "service_role";

revoke insert on table "public"."aurora_statistical_forecast" from "service_role";

revoke references on table "public"."aurora_statistical_forecast" from "service_role";

revoke select on table "public"."aurora_statistical_forecast" from "service_role";

revoke trigger on table "public"."aurora_statistical_forecast" from "service_role";

revoke truncate on table "public"."aurora_statistical_forecast" from "service_role";

revoke update on table "public"."aurora_statistical_forecast" from "service_role";

revoke delete on table "public"."aurora_statistical_metrics" from "anon";

revoke insert on table "public"."aurora_statistical_metrics" from "anon";

revoke references on table "public"."aurora_statistical_metrics" from "anon";

revoke select on table "public"."aurora_statistical_metrics" from "anon";

revoke trigger on table "public"."aurora_statistical_metrics" from "anon";

revoke truncate on table "public"."aurora_statistical_metrics" from "anon";

revoke update on table "public"."aurora_statistical_metrics" from "anon";

revoke delete on table "public"."aurora_statistical_metrics" from "authenticated";

revoke insert on table "public"."aurora_statistical_metrics" from "authenticated";

revoke references on table "public"."aurora_statistical_metrics" from "authenticated";

revoke select on table "public"."aurora_statistical_metrics" from "authenticated";

revoke trigger on table "public"."aurora_statistical_metrics" from "authenticated";

revoke truncate on table "public"."aurora_statistical_metrics" from "authenticated";

revoke update on table "public"."aurora_statistical_metrics" from "authenticated";

revoke delete on table "public"."aurora_statistical_metrics" from "service_role";

revoke insert on table "public"."aurora_statistical_metrics" from "service_role";

revoke references on table "public"."aurora_statistical_metrics" from "service_role";

revoke select on table "public"."aurora_statistical_metrics" from "service_role";

revoke trigger on table "public"."aurora_statistical_metrics" from "service_role";

revoke truncate on table "public"."aurora_statistical_metrics" from "service_role";

revoke update on table "public"."aurora_statistical_metrics" from "service_role";

revoke delete on table "public"."crawled_url_next_urls" from "anon";

revoke insert on table "public"."crawled_url_next_urls" from "anon";

revoke references on table "public"."crawled_url_next_urls" from "anon";

revoke select on table "public"."crawled_url_next_urls" from "anon";

revoke trigger on table "public"."crawled_url_next_urls" from "anon";

revoke truncate on table "public"."crawled_url_next_urls" from "anon";

revoke update on table "public"."crawled_url_next_urls" from "anon";

revoke delete on table "public"."crawled_url_next_urls" from "authenticated";

revoke insert on table "public"."crawled_url_next_urls" from "authenticated";

revoke references on table "public"."crawled_url_next_urls" from "authenticated";

revoke select on table "public"."crawled_url_next_urls" from "authenticated";

revoke trigger on table "public"."crawled_url_next_urls" from "authenticated";

revoke truncate on table "public"."crawled_url_next_urls" from "authenticated";

revoke update on table "public"."crawled_url_next_urls" from "authenticated";

revoke delete on table "public"."crawled_url_next_urls" from "service_role";

revoke insert on table "public"."crawled_url_next_urls" from "service_role";

revoke references on table "public"."crawled_url_next_urls" from "service_role";

revoke select on table "public"."crawled_url_next_urls" from "service_role";

revoke trigger on table "public"."crawled_url_next_urls" from "service_role";

revoke truncate on table "public"."crawled_url_next_urls" from "service_role";

revoke update on table "public"."crawled_url_next_urls" from "service_role";

revoke delete on table "public"."crawled_urls" from "anon";

revoke insert on table "public"."crawled_urls" from "anon";

revoke references on table "public"."crawled_urls" from "anon";

revoke select on table "public"."crawled_urls" from "anon";

revoke trigger on table "public"."crawled_urls" from "anon";

revoke truncate on table "public"."crawled_urls" from "anon";

revoke update on table "public"."crawled_urls" from "anon";

revoke delete on table "public"."crawled_urls" from "authenticated";

revoke insert on table "public"."crawled_urls" from "authenticated";

revoke references on table "public"."crawled_urls" from "authenticated";

revoke select on table "public"."crawled_urls" from "authenticated";

revoke trigger on table "public"."crawled_urls" from "authenticated";

revoke truncate on table "public"."crawled_urls" from "authenticated";

revoke update on table "public"."crawled_urls" from "authenticated";

revoke delete on table "public"."crawled_urls" from "service_role";

revoke insert on table "public"."crawled_urls" from "service_role";

revoke references on table "public"."crawled_urls" from "service_role";

revoke select on table "public"."crawled_urls" from "service_role";

revoke trigger on table "public"."crawled_urls" from "service_role";

revoke truncate on table "public"."crawled_urls" from "service_role";

revoke update on table "public"."crawled_urls" from "service_role";

alter table "public"."aurora_ml_forecast" drop constraint "aurora_ml_forecast_ws_id_fkey";

alter table "public"."aurora_ml_metrics" drop constraint "aurora_ml_metrics_ws_id_fkey";

alter table "public"."aurora_statistical_forecast" drop constraint "aurora_statistical_forecast_ws_id_fkey";

alter table "public"."aurora_statistical_metrics" drop constraint "aurora_statistical_metrics_ws_id_fkey";

alter table "public"."crawled_url_next_urls" drop constraint "crawled_url_next_urls_origin_id_fkey";

alter table "public"."crawled_urls" drop constraint "crawled_urls_creator_id_fkey";

alter table "public"."nova_leaderboard" drop constraint "nova_leaderboard_userId_fkey";

alter table "public"."nova_test_timer_record" drop constraint "nova_test_timer_record_userId_fkey";

alter table "public"."nova_users_problem_history" drop constraint "nova_users_problem_history_userId_fkey";

alter table "public"."aurora_ml_forecast" drop constraint "aurora_ml_forecast_pkey";

alter table "public"."aurora_ml_metrics" drop constraint "aurora_ml_metrics_pkey";

alter table "public"."aurora_statistical_forecast" drop constraint "aurora_statistical_forecast_pkey";

alter table "public"."aurora_statistical_metrics" drop constraint "aurora_statistical_metrics_pkey";

alter table "public"."crawled_url_next_urls" drop constraint "crawled_url_next_urls_pkey";

alter table "public"."crawled_urls" drop constraint "crawled_urls_pkey";

drop index if exists "public"."aurora_ml_forecast_pkey";

drop index if exists "public"."aurora_ml_metrics_pkey";

drop index if exists "public"."aurora_statistical_forecast_pkey";

drop index if exists "public"."aurora_statistical_metrics_pkey";

drop index if exists "public"."crawled_url_next_urls_pkey";

drop index if exists "public"."crawled_urls_pkey";

drop table "public"."aurora_ml_forecast";

drop table "public"."aurora_ml_metrics";

drop table "public"."aurora_statistical_forecast";

drop table "public"."aurora_statistical_metrics";

drop table "public"."crawled_url_next_urls";

drop table "public"."crawled_urls";

alter table "public"."nova_leaderboard" drop column "problem_id";

alter table "public"."nova_leaderboard" drop column "user_id";

alter table "public"."nova_leaderboard" add column "problemId" character varying;

alter table "public"."nova_leaderboard" add column "userId" uuid;

alter table "public"."nova_leaderboard" disable row level security;

alter table "public"."nova_test_timer_record" drop column "user_id";

alter table "public"."nova_test_timer_record" add column "userId" uuid;

alter table "public"."nova_test_timer_record" disable row level security;

alter table "public"."nova_users_problem_history" drop column "problem_id";

alter table "public"."nova_users_problem_history" drop column "user_id";

alter table "public"."nova_users_problem_history" add column "problemId" text;

alter table "public"."nova_users_problem_history" add column "userId" uuid;

alter table "public"."nova_users_problem_history" alter column "feedback" set data type character varying using "feedback"::character varying;

alter table "public"."nova_users_problem_history" disable row level security;

alter table "public"."workspace_datasets" add column "html_ids" text[];

alter table "public"."workspace_datasets" add column "type" dataset_type not null default 'excel'::dataset_type;

alter table "public"."nova_leaderboard" add constraint "nova_leaderboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES workspace_users(id) not valid;

alter table "public"."nova_leaderboard" validate constraint "nova_leaderboard_userId_fkey";

alter table "public"."nova_test_timer_record" add constraint "nova_test_timer_record_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) not valid;

alter table "public"."nova_test_timer_record" validate constraint "nova_test_timer_record_userId_fkey";

alter table "public"."nova_users_problem_history" add constraint "nova_users_problem_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) not valid;

alter table "public"."nova_users_problem_history" validate constraint "nova_users_problem_history_userId_fkey";


