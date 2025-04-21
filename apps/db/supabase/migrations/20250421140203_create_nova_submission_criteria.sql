drop policy " Enable all access for challenge manager" on "public"."nova_problem_criteria_scores";

revoke delete on table "public"."nova_problem_criteria_scores" from "anon";

revoke insert on table "public"."nova_problem_criteria_scores" from "anon";

revoke references on table "public"."nova_problem_criteria_scores" from "anon";

revoke select on table "public"."nova_problem_criteria_scores" from "anon";

revoke trigger on table "public"."nova_problem_criteria_scores" from "anon";

revoke truncate on table "public"."nova_problem_criteria_scores" from "anon";

revoke update on table "public"."nova_problem_criteria_scores" from "anon";

revoke delete on table "public"."nova_problem_criteria_scores" from "authenticated";

revoke insert on table "public"."nova_problem_criteria_scores" from "authenticated";

revoke references on table "public"."nova_problem_criteria_scores" from "authenticated";

revoke select on table "public"."nova_problem_criteria_scores" from "authenticated";

revoke trigger on table "public"."nova_problem_criteria_scores" from "authenticated";

revoke truncate on table "public"."nova_problem_criteria_scores" from "authenticated";

revoke update on table "public"."nova_problem_criteria_scores" from "authenticated";

revoke delete on table "public"."nova_problem_criteria_scores" from "service_role";

revoke insert on table "public"."nova_problem_criteria_scores" from "service_role";

revoke references on table "public"."nova_problem_criteria_scores" from "service_role";

revoke select on table "public"."nova_problem_criteria_scores" from "service_role";

revoke trigger on table "public"."nova_problem_criteria_scores" from "service_role";

revoke truncate on table "public"."nova_problem_criteria_scores" from "service_role";

revoke update on table "public"."nova_problem_criteria_scores" from "service_role";

alter table "public"."nova_problem_criteria_scores" drop constraint "nova_problem_criteria_scores_criteria_id_fkey";

alter table "public"."nova_problem_criteria_scores" drop constraint "nova_problem_criteria_scores_problem_id_fkey";

alter table "public"."nova_problem_criteria_scores" drop constraint "nova_problem_criteria_scores_pkey";

drop index if exists "public"."nova_problem_criteria_scores_pkey";

drop table "public"."nova_problem_criteria_scores";

create table "public"."nova_submission_criteria" (
    "submission_id" uuid not null,
    "criteria_id" uuid not null,
    "score" real not null check (score >= 0 and score <= 10),
    "feedback" text not null,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."nova_submission_criteria" enable row level security;

CREATE UNIQUE INDEX nova_submission_criteria_pkey ON public.nova_submission_criteria USING btree (submission_id, criteria_id);

alter table "public"."nova_submission_criteria" add constraint "nova_submission_criteria_pkey" PRIMARY KEY using index "nova_submission_criteria_pkey";

alter table "public"."nova_submission_criteria" add constraint "nova_submission_criteria_criteria_id_fkey" FOREIGN KEY (criteria_id) REFERENCES nova_challenge_criteria(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_submission_criteria" validate constraint "nova_submission_criteria_criteria_id_fkey";

alter table "public"."nova_submission_criteria" add constraint "nova_submission_criteria_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES nova_submissions(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_submission_criteria" validate constraint "nova_submission_criteria_submission_id_fkey";

grant delete on table "public"."nova_submission_criteria" to "anon";

grant insert on table "public"."nova_submission_criteria" to "anon";

grant references on table "public"."nova_submission_criteria" to "anon";

grant select on table "public"."nova_submission_criteria" to "anon";

grant trigger on table "public"."nova_submission_criteria" to "anon";

grant truncate on table "public"."nova_submission_criteria" to "anon";

grant update on table "public"."nova_submission_criteria" to "anon";

grant delete on table "public"."nova_submission_criteria" to "authenticated";

grant insert on table "public"."nova_submission_criteria" to "authenticated";

grant references on table "public"."nova_submission_criteria" to "authenticated";

grant select on table "public"."nova_submission_criteria" to "authenticated";

grant trigger on table "public"."nova_submission_criteria" to "authenticated";

grant truncate on table "public"."nova_submission_criteria" to "authenticated";

grant update on table "public"."nova_submission_criteria" to "authenticated";

grant delete on table "public"."nova_submission_criteria" to "service_role";

grant insert on table "public"."nova_submission_criteria" to "service_role";

grant references on table "public"."nova_submission_criteria" to "service_role";

grant select on table "public"."nova_submission_criteria" to "service_role";

grant trigger on table "public"."nova_submission_criteria" to "service_role";

grant truncate on table "public"."nova_submission_criteria" to "service_role";

grant update on table "public"."nova_submission_criteria" to "service_role";

create policy " Enable all access for challenge manager"
on "public"."nova_submission_criteria"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());