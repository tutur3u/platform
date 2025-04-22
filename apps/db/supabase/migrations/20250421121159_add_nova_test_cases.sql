alter table "public"."nova_problem_test_cases" add column "hidden" boolean not null default true;
alter table "public"."nova_problem_test_cases" add column "output" text;
update "public"."nova_problem_test_cases" set "output" = '';
alter table "public"."nova_problem_test_cases" alter column "output" set not null;
alter table "public"."nova_sessions" drop column "total_score";

-- Drop tables and revoke permissions first
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

-- Create a default criterion for each challenge if it doesn't exist
INSERT INTO "public"."nova_challenge_criteria" (id, name, description, challenge_id)
SELECT 
    gen_random_uuid(), 
    'Default', 
    'Default criterion for migration of legacy scores',
    c.id
FROM 
    "public"."nova_challenges" c
WHERE 
    NOT EXISTS (
        SELECT 1 
        FROM "public"."nova_challenge_criteria" 
        WHERE challenge_id = c.id AND name = 'Default'
    );

-- Create the new tables first
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

-- Now handle the submission IDs and data migration
-- We need to create a UUID table first to handle the ID transformation
CREATE TEMP TABLE submissions_with_new_id AS
SELECT 
    s.id as old_id,
    gen_random_uuid() as new_id,
    s.problem_id,
    s.score,
    s.feedback
FROM 
    "public"."nova_submissions" s
WHERE 
    s.score IS NOT NULL;

-- Store the mapping for later use
CREATE TEMP TABLE id_mapping AS
SELECT old_id, new_id FROM submissions_with_new_id;

-- Modify the nova_submissions table
alter table "public"."nova_submissions" drop column "score";
alter table "public"."nova_submissions" drop column "feedback";

alter table "public"."nova_submissions" drop constraint "nova_users_problem_history_pkey" cascade;
drop index if exists "public"."nova_users_problem_history_pkey";

-- Instead of generating random UUIDs, use our pre-generated ones for submissions with scores
alter table "public"."nova_submissions" add column "new_id" uuid;

-- Update submissions that had scores with our pre-generated UUIDs
UPDATE "public"."nova_submissions" s
SET new_id = m.new_id
FROM id_mapping m
WHERE s.id = m.old_id::bigint;

-- For submissions without scores, generate new UUIDs
UPDATE "public"."nova_submissions"
SET new_id = gen_random_uuid()
WHERE new_id IS NULL;

-- Now make it not null
alter table "public"."nova_submissions" alter column "new_id" SET NOT NULL;

alter table "public"."nova_submissions" drop column "id";
alter table "public"."nova_submissions" rename column "new_id" to "id";

CREATE UNIQUE INDEX nova_submissions_pkey ON public.nova_submissions USING btree (id);
alter table "public"."nova_submissions" add constraint "nova_submissions_pkey" PRIMARY KEY using index "nova_submissions_pkey";

-- Now add the foreign key constraints
alter table "public"."nova_submission_criteria" add constraint "nova_submission_criteria_criteria_id_fkey" FOREIGN KEY (criteria_id) REFERENCES nova_challenge_criteria(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."nova_submission_criteria" validate constraint "nova_submission_criteria_criteria_id_fkey";

alter table "public"."nova_submission_criteria" add constraint "nova_submission_criteria_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES nova_submissions(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."nova_submission_criteria" validate constraint "nova_submission_criteria_submission_id_fkey";

alter table "public"."nova_submission_test_cases" add constraint "nova_submission_test_cases_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES nova_submissions(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."nova_submission_test_cases" validate constraint "nova_submission_test_cases_submission_id_fkey";

alter table "public"."nova_submission_test_cases" add constraint "nova_submission_test_cases_test_case_id_fkey" FOREIGN KEY (test_case_id) REFERENCES nova_problem_test_cases(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."nova_submission_test_cases" validate constraint "nova_submission_test_cases_test_case_id_fkey";

-- Insert into nova_submission_criteria using the problem_id to find the associated challenge_id
INSERT INTO "public"."nova_submission_criteria" (submission_id, criteria_id, score, feedback)
SELECT 
    swni.new_id,
    (SELECT 
        cc.id 
     FROM 
        "public"."nova_challenge_criteria" cc
     JOIN 
        "public"."nova_problems" p ON p.challenge_id = cc.challenge_id
     WHERE 
        p.id = swni.problem_id AND cc.name = 'Default'
     LIMIT 1),
    GREATEST(0, LEAST(COALESCE(swni.score, 0), 10)),
    COALESCE(swni.feedback, '')
FROM 
    submissions_with_new_id swni;

-- Clean up temp tables
DROP TABLE submissions_with_new_id;
DROP TABLE id_mapping;

-- Add permissions
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

-- Create policies
create policy " Enable all access for challenge manager"
on "public"."nova_submission_criteria"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());

create policy " Enable all access for challenge manager"
on "public"."nova_submission_test_cases"
as permissive
for all
to authenticated
using (is_nova_challenge_manager())
with check (is_nova_challenge_manager());

alter table "public"."nova_submissions" alter column "id" set default gen_random_uuid();