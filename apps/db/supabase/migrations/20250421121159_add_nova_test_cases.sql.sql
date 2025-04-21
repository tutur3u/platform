alter table "public"."nova_problem_test_cases" add column "hidden" boolean not null default true;
alter table "public"."nova_problem_test_cases" add column "output" text;
update "public"."nova_problem_test_cases" set "output" = '';
alter table "public"."nova_problem_test_cases" alter column "output" set not null;
alter table "public"."nova_sessions" drop column "total_score";

alter table "public"."nova_submissions" drop column "score";
alter table "public"."nova_submissions" drop column "feedback";

alter table "public"."nova_submissions" drop constraint "nova_users_problem_history_pkey" cascade;
drop index if exists "public"."nova_users_problem_history_pkey";

alter table "public"."nova_submissions" add column "new_id" uuid not null default gen_random_uuid();

alter table "public"."nova_submissions" drop column "id";
alter table "public"."nova_submissions" rename column "new_id" to "id";

CREATE UNIQUE INDEX nova_submissions_pkey ON public.nova_submissions USING btree (id);
alter table "public"."nova_submissions" add constraint "nova_submissions_pkey" PRIMARY KEY using index "nova_submissions_pkey";

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

CREATE OR REPLACE VIEW nova_submissions_with_scores AS
WITH test_case_stats AS (
  SELECT 
    submission_id,
    COUNT(*) AS total_tests,
    COUNT(CASE WHEN matched = true THEN 1 END) AS passed_tests
  FROM nova_submission_test_cases
  GROUP BY submission_id
),
criteria_stats AS (
  SELECT
    submission_id,
    COUNT(*) AS total_criteria,
    SUM(score) AS sum_criterion_score
  FROM nova_submission_criteria
  GROUP BY submission_id
)
SELECT 
  s.*,
  tc.total_tests,
  tc.passed_tests,
  COALESCE((tc.passed_tests::float / NULLIF(tc.total_tests, 0)) * 10, 0) AS test_case_score,
  cr.total_criteria,
  cr.sum_criterion_score,
  COALESCE((cr.sum_criterion_score::float / NULLIF(cr.total_criteria * 10, 0)) * 10, 0) AS criteria_score,
  CASE
    WHEN tc.total_tests > 0 AND cr.total_criteria > 0 THEN 
      COALESCE((tc.passed_tests::float / tc.total_tests) * 5, 0) + 
      COALESCE((cr.sum_criterion_score::float / (cr.total_criteria * 10)) * 5, 0)
    WHEN tc.total_tests > 0 THEN 
      COALESCE((tc.passed_tests::float / tc.total_tests) * 10, 0)
    WHEN cr.total_criteria > 0 THEN 
      COALESCE((cr.sum_criterion_score::float / (cr.total_criteria * 10)) * 10, 0)
    ELSE 0
  END AS total_score
FROM nova_submissions s
LEFT JOIN test_case_stats tc ON s.id = tc.submission_id
LEFT JOIN criteria_stats cr ON s.id = cr.submission_id;