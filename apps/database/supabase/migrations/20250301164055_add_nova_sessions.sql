alter table
    "public"."nova_problem_constraints"
alter column
    "constraint_content"
set
    not null;

alter table
    "public"."nova_problem_testcases"
alter column
    "testcase_content"
set
    not null;

drop policy "Enable all access for current user" on "public"."nova_challenge_status";

revoke delete on table "public"."nova_challenge_status"
from
    "anon";

revoke
insert
    on table "public"."nova_challenge_status"
from
    "anon";

revoke references on table "public"."nova_challenge_status"
from
    "anon";

revoke
select
    on table "public"."nova_challenge_status"
from
    "anon";

revoke trigger on table "public"."nova_challenge_status"
from
    "anon";

revoke truncate on table "public"."nova_challenge_status"
from
    "anon";

revoke
update
    on table "public"."nova_challenge_status"
from
    "anon";

revoke delete on table "public"."nova_challenge_status"
from
    "authenticated";

revoke
insert
    on table "public"."nova_challenge_status"
from
    "authenticated";

revoke references on table "public"."nova_challenge_status"
from
    "authenticated";

revoke
select
    on table "public"."nova_challenge_status"
from
    "authenticated";

revoke trigger on table "public"."nova_challenge_status"
from
    "authenticated";

revoke truncate on table "public"."nova_challenge_status"
from
    "authenticated";

revoke
update
    on table "public"."nova_challenge_status"
from
    "authenticated";

revoke delete on table "public"."nova_challenge_status"
from
    "service_role";

revoke
insert
    on table "public"."nova_challenge_status"
from
    "service_role";

revoke references on table "public"."nova_challenge_status"
from
    "service_role";

revoke
select
    on table "public"."nova_challenge_status"
from
    "service_role";

revoke trigger on table "public"."nova_challenge_status"
from
    "service_role";

revoke truncate on table "public"."nova_challenge_status"
from
    "service_role";

revoke
update
    on table "public"."nova_challenge_status"
from
    "service_role";

revoke delete on table "public"."nova_problem_constraints"
from
    "anon";

revoke
insert
    on table "public"."nova_problem_constraints"
from
    "anon";

revoke references on table "public"."nova_problem_constraints"
from
    "anon";

revoke
select
    on table "public"."nova_problem_constraints"
from
    "anon";

revoke trigger on table "public"."nova_problem_constraints"
from
    "anon";

revoke truncate on table "public"."nova_problem_constraints"
from
    "anon";

revoke
update
    on table "public"."nova_problem_constraints"
from
    "anon";

revoke delete on table "public"."nova_problem_constraints"
from
    "authenticated";

revoke
insert
    on table "public"."nova_problem_constraints"
from
    "authenticated";

revoke references on table "public"."nova_problem_constraints"
from
    "authenticated";

revoke
select
    on table "public"."nova_problem_constraints"
from
    "authenticated";

revoke trigger on table "public"."nova_problem_constraints"
from
    "authenticated";

revoke truncate on table "public"."nova_problem_constraints"
from
    "authenticated";

revoke
update
    on table "public"."nova_problem_constraints"
from
    "authenticated";

revoke delete on table "public"."nova_problem_constraints"
from
    "service_role";

revoke
insert
    on table "public"."nova_problem_constraints"
from
    "service_role";

revoke references on table "public"."nova_problem_constraints"
from
    "service_role";

revoke
select
    on table "public"."nova_problem_constraints"
from
    "service_role";

revoke trigger on table "public"."nova_problem_constraints"
from
    "service_role";

revoke truncate on table "public"."nova_problem_constraints"
from
    "service_role";

revoke
update
    on table "public"."nova_problem_constraints"
from
    "service_role";

alter table
    "public"."nova_challenge_status" drop constraint "nova_challenge_status_challenge_id_fkey";

alter table
    "public"."nova_challenge_status" drop constraint "nova_challenge_status_user_id_fkey";

alter table
    "public"."nova_problem_constraints" drop constraint "nova_problem_constraints_problem_id_fkey";

alter table
    "public"."nova_challenge_status" drop constraint "nova_challenge_status_pkey";

alter table
    "public"."nova_problem_constraints" drop constraint "nova_problem_constraints_pkey";

drop index if exists "public"."nova_problem_constraints_pkey";

drop index if exists "public"."nova_challenge_status_pkey";

drop table "public"."nova_challenge_status";

drop table "public"."nova_problem_constraints";

create table "public"."nova_sessions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "challenge_id" uuid not null,
    "status" text not null,
    "start_time" timestamp with time zone not null,
    "end_time" timestamp with time zone not null,
    "total_score" real not null,
    "created_at" timestamp with time zone not null default now()
);

alter table
    "public"."nova_sessions" enable row level security;

alter table
    "public"."nova_challenges"
alter column
    "description"
set
    not null;

alter table
    "public"."nova_challenges"
alter column
    "duration"
set
    not null;

alter table
    "public"."nova_problem_testcases" drop column "testcase_content";

alter table
    "public"."nova_problem_testcases"
add
    column "input" text not null;

alter table
    "public"."nova_problems"
add
    column "max_input_length" integer not null;

alter table
    "public"."nova_problems"
alter column
    "description"
set
    not null;

alter table
    "public"."nova_problems"
alter column
    "example_input"
set
    not null;

alter table
    "public"."nova_problems"
alter column
    "example_output"
set
    not null;

alter table
    "public"."nova_submissions" drop column "feedback";

alter table
    "public"."nova_submissions" drop column "user_prompt";

alter table
    "public"."nova_submissions"
add
    column "input" text not null;

alter table
    "public"."nova_submissions"
add
    column "output" text not null;

alter table
    "public"."nova_submissions"
alter column
    "score"
set
    not null;

CREATE UNIQUE INDEX nova_challenge_status_pkey ON public.nova_sessions USING btree (id);

alter table
    "public"."nova_sessions"
add
    constraint "nova_challenge_status_pkey" PRIMARY KEY using index "nova_challenge_status_pkey";

alter table
    "public"."nova_sessions"
add
    constraint "nova_sessions_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES nova_challenges(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."nova_sessions" validate constraint "nova_sessions_challenge_id_fkey";

alter table
    "public"."nova_sessions"
add
    constraint "nova_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."nova_sessions" validate constraint "nova_sessions_user_id_fkey";

grant delete on table "public"."nova_sessions" to "anon";

grant
insert
    on table "public"."nova_sessions" to "anon";

grant references on table "public"."nova_sessions" to "anon";

grant
select
    on table "public"."nova_sessions" to "anon";

grant trigger on table "public"."nova_sessions" to "anon";

grant truncate on table "public"."nova_sessions" to "anon";

grant
update
    on table "public"."nova_sessions" to "anon";

grant delete on table "public"."nova_sessions" to "authenticated";

grant
insert
    on table "public"."nova_sessions" to "authenticated";

grant references on table "public"."nova_sessions" to "authenticated";

grant
select
    on table "public"."nova_sessions" to "authenticated";

grant trigger on table "public"."nova_sessions" to "authenticated";

grant truncate on table "public"."nova_sessions" to "authenticated";

grant
update
    on table "public"."nova_sessions" to "authenticated";

grant delete on table "public"."nova_sessions" to "service_role";

grant
insert
    on table "public"."nova_sessions" to "service_role";

grant references on table "public"."nova_sessions" to "service_role";

grant
select
    on table "public"."nova_sessions" to "service_role";

grant trigger on table "public"."nova_sessions" to "service_role";

grant truncate on table "public"."nova_sessions" to "service_role";

grant
update
    on table "public"."nova_sessions" to "service_role";

create policy "Enable all access for current user" on "public"."nova_sessions" as permissive for all to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));