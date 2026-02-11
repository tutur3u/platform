create table "public"."nova_challenges" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "title" text,
    "topic" text,
    "description" text,
    "duration" integer
);

alter table
    "public"."nova_challenges" enable row level security;

CREATE UNIQUE INDEX nova_challenges_pkey ON public.nova_challenges USING btree (id);

alter table
    "public"."nova_challenges"
add
    constraint "nova_challenges_pkey" PRIMARY KEY using index "nova_challenges_pkey";

grant delete on table "public"."nova_challenges" to "anon";

grant
insert
    on table "public"."nova_challenges" to "anon";

grant references on table "public"."nova_challenges" to "anon";

grant
select
    on table "public"."nova_challenges" to "anon";

grant trigger on table "public"."nova_challenges" to "anon";

grant truncate on table "public"."nova_challenges" to "anon";

grant
update
    on table "public"."nova_challenges" to "anon";

grant delete on table "public"."nova_challenges" to "authenticated";

grant
insert
    on table "public"."nova_challenges" to "authenticated";

grant references on table "public"."nova_challenges" to "authenticated";

grant
select
    on table "public"."nova_challenges" to "authenticated";

grant trigger on table "public"."nova_challenges" to "authenticated";

grant truncate on table "public"."nova_challenges" to "authenticated";

grant
update
    on table "public"."nova_challenges" to "authenticated";

grant delete on table "public"."nova_challenges" to "service_role";

grant
insert
    on table "public"."nova_challenges" to "service_role";

grant references on table "public"."nova_challenges" to "service_role";

grant
select
    on table "public"."nova_challenges" to "service_role";

grant trigger on table "public"."nova_challenges" to "service_role";

grant truncate on table "public"."nova_challenges" to "service_role";

grant
update
    on table "public"."nova_challenges" to "service_role";

alter table
    "public"."nova_challenges" disable row level security;

create table "public"."nova_problems" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "challenge_id" uuid,
    "title" text,
    "description" text,
    "exampleInput" text,
    "exampleOutput" text
);

alter table
    "public"."nova_problems" enable row level security;

CREATE UNIQUE INDEX nova_problems_pkey ON public.nova_problems USING btree (id);

alter table
    "public"."nova_problems"
add
    constraint "nova_problems_pkey" PRIMARY KEY using index "nova_problems_pkey";

alter table
    "public"."nova_problems"
add
    constraint "nova_problems_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES nova_challenges(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."nova_problems" validate constraint "nova_problems_challenge_id_fkey";

grant delete on table "public"."nova_problems" to "anon";

grant
insert
    on table "public"."nova_problems" to "anon";

grant references on table "public"."nova_problems" to "anon";

grant
select
    on table "public"."nova_problems" to "anon";

grant trigger on table "public"."nova_problems" to "anon";

grant truncate on table "public"."nova_problems" to "anon";

grant
update
    on table "public"."nova_problems" to "anon";

grant delete on table "public"."nova_problems" to "authenticated";

grant
insert
    on table "public"."nova_problems" to "authenticated";

grant references on table "public"."nova_problems" to "authenticated";

grant
select
    on table "public"."nova_problems" to "authenticated";

grant trigger on table "public"."nova_problems" to "authenticated";

grant truncate on table "public"."nova_problems" to "authenticated";

grant
update
    on table "public"."nova_problems" to "authenticated";

grant delete on table "public"."nova_problems" to "service_role";

grant
insert
    on table "public"."nova_problems" to "service_role";

grant references on table "public"."nova_problems" to "service_role";

grant
select
    on table "public"."nova_problems" to "service_role";

grant trigger on table "public"."nova_problems" to "service_role";

grant truncate on table "public"."nova_problems" to "service_role";

grant
update
    on table "public"."nova_problems" to "service_role";

create table "public"."nova_problem_constraints" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "constraint_content" text,
    "problem_id" uuid
);

alter table
    "public"."nova_problem_testcases"
alter column
    "problem_id" drop default;

alter table
    "public"."nova_problem_testcases" disable row level security;

alter table
    "public"."nova_problems" disable row level security;

CREATE UNIQUE INDEX nova_problem_constraints_pkey ON public.nova_problem_constraints USING btree (id);

alter table
    "public"."nova_problem_constraints"
add
    constraint "nova_problem_constraints_pkey" PRIMARY KEY using index "nova_problem_constraints_pkey";

alter table
    "public"."nova_problem_constraints"
add
    constraint "nova_problem_constraints_problem_id_fkey" FOREIGN KEY (problem_id) REFERENCES nova_problems(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."nova_problem_constraints" validate constraint "nova_problem_constraints_problem_id_fkey";

alter table
    "public"."nova_problem_testcases"
add
    constraint "nova_problem_testcases_problem_id_fkey" FOREIGN KEY (problem_id) REFERENCES nova_problems(id) not valid;

alter table
    "public"."nova_problem_testcases" validate constraint "nova_problem_testcases_problem_id_fkey";

grant delete on table "public"."nova_problem_constraints" to "anon";

grant
insert
    on table "public"."nova_problem_constraints" to "anon";

grant references on table "public"."nova_problem_constraints" to "anon";

grant
select
    on table "public"."nova_problem_constraints" to "anon";

grant trigger on table "public"."nova_problem_constraints" to "anon";

grant truncate on table "public"."nova_problem_constraints" to "anon";

grant
update
    on table "public"."nova_problem_constraints" to "anon";

grant delete on table "public"."nova_problem_constraints" to "authenticated";

grant
insert
    on table "public"."nova_problem_constraints" to "authenticated";

grant references on table "public"."nova_problem_constraints" to "authenticated";

grant
select
    on table "public"."nova_problem_constraints" to "authenticated";

grant trigger on table "public"."nova_problem_constraints" to "authenticated";

grant truncate on table "public"."nova_problem_constraints" to "authenticated";

grant
update
    on table "public"."nova_problem_constraints" to "authenticated";

grant delete on table "public"."nova_problem_constraints" to "service_role";

grant
insert
    on table "public"."nova_problem_constraints" to "service_role";

grant references on table "public"."nova_problem_constraints" to "service_role";

grant
select
    on table "public"."nova_problem_constraints" to "service_role";

grant trigger on table "public"."nova_problem_constraints" to "service_role";

grant truncate on table "public"."nova_problem_constraints" to "service_role";

grant
update
    on table "public"."nova_problem_constraints" to "service_role";

alter table
    "public"."nova_problem_testcases" drop column "constraint_content";

alter table
    "public"."nova_problem_testcases"
add
    column "testcase_content" text;