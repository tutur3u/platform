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

alter table "public"."nova_submission_outputs" drop constraint "nova_submission_outputs_pkey";

drop index if exists "public"."nova_submission_outputs_pkey";

drop table "public"."nova_submission_outputs";

create table "public"."nova_submission_test_cases" (
    "created_at" timestamp with time zone not null default now(),
    "output" text not null,
    "submission_id" uuid not null,
    "test_case_id" uuid not null,
    "matched" boolean not null default false
);

alter table "public"."nova_submission_test_cases" enable row level security;

CREATE UNIQUE INDEX nova_submission_test_cases_pkey ON public.nova_submission_test_cases USING btree (submission_id, test_case_id);

alter table "public"."nova_submission_test_cases" add constraint "nova_submission_test_cases_pkey" PRIMARY KEY using index "nova_submission_test_cases_pkey";

alter table "public"."nova_submission_test_cases" add constraint "nova_submission_test_cases_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES nova_submissions(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_submission_test_cases" validate constraint "nova_submission_test_cases_submission_id_fkey";

alter table "public"."nova_submission_test_cases" add constraint "nova_submission_test_cases_test_case_id_fkey" FOREIGN KEY (test_case_id) REFERENCES nova_problem_test_cases(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_submission_test_cases" validate constraint "nova_submission_test_cases_test_case_id_fkey";

grant delete on table "public"."nova_submission_test_cases" to "anon";

grant insert on table "public"."nova_submission_test_cases" to "anon";

grant references on table "public"."nova_submission_test_cases" to "anon";

grant select on table "public"."nova_submission_test_cases" to "anon";

grant trigger on table "public"."nova_submission_test_cases" to "anon";

grant truncate on table "public"."nova_submission_test_cases" to "anon";

grant update on table "public"."nova_submission_test_cases" to "anon";

grant delete on table "public"."nova_submission_test_cases" to "authenticated";

grant insert on table "public"."nova_submission_test_cases" to "authenticated";

grant references on table "public"."nova_submission_test_cases" to "authenticated";

grant select on table "public"."nova_submission_test_cases" to "authenticated";

grant trigger on table "public"."nova_submission_test_cases" to "authenticated";

grant truncate on table "public"."nova_submission_test_cases" to "authenticated";

grant update on table "public"."nova_submission_test_cases" to "authenticated";

grant delete on table "public"."nova_submission_test_cases" to "service_role";

grant insert on table "public"."nova_submission_test_cases" to "service_role";

grant references on table "public"."nova_submission_test_cases" to "service_role";

grant select on table "public"."nova_submission_test_cases" to "service_role";

grant trigger on table "public"."nova_submission_test_cases" to "service_role";

grant truncate on table "public"."nova_submission_test_cases" to "service_role";

grant update on table "public"."nova_submission_test_cases" to "service_role";

create policy " Enable all access for challenge manager"
on "public"."nova_submission_test_cases"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());