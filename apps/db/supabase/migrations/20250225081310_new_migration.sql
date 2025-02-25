create table "public"."nova_problem_constraints" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "constraint_content" text,
    "problem_id" uuid
);


alter table "public"."nova_problem_testcases" alter column "problem_id" drop default;

alter table "public"."nova_problem_testcases" disable row level security;

alter table "public"."nova_problems" disable row level security;

CREATE UNIQUE INDEX nova_problem_constraints_pkey ON public.nova_problem_constraints USING btree (id);

alter table "public"."nova_problem_constraints" add constraint "nova_problem_constraints_pkey" PRIMARY KEY using index "nova_problem_constraints_pkey";

alter table "public"."nova_problem_constraints" add constraint "nova_problem_constraints_problem_id_fkey" FOREIGN KEY (problem_id) REFERENCES nova_problems(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_problem_constraints" validate constraint "nova_problem_constraints_problem_id_fkey";

alter table "public"."nova_problem_testcases" add constraint "nova_problem_testcases_problem_id_fkey" FOREIGN KEY (problem_id) REFERENCES nova_problems(id) not valid;

alter table "public"."nova_problem_testcases" validate constraint "nova_problem_testcases_problem_id_fkey";

grant delete on table "public"."nova_problem_constraints" to "anon";

grant insert on table "public"."nova_problem_constraints" to "anon";

grant references on table "public"."nova_problem_constraints" to "anon";

grant select on table "public"."nova_problem_constraints" to "anon";

grant trigger on table "public"."nova_problem_constraints" to "anon";

grant truncate on table "public"."nova_problem_constraints" to "anon";

grant update on table "public"."nova_problem_constraints" to "anon";

grant delete on table "public"."nova_problem_constraints" to "authenticated";

grant insert on table "public"."nova_problem_constraints" to "authenticated";

grant references on table "public"."nova_problem_constraints" to "authenticated";

grant select on table "public"."nova_problem_constraints" to "authenticated";

grant trigger on table "public"."nova_problem_constraints" to "authenticated";

grant truncate on table "public"."nova_problem_constraints" to "authenticated";

grant update on table "public"."nova_problem_constraints" to "authenticated";

grant delete on table "public"."nova_problem_constraints" to "service_role";

grant insert on table "public"."nova_problem_constraints" to "service_role";

grant references on table "public"."nova_problem_constraints" to "service_role";

grant select on table "public"."nova_problem_constraints" to "service_role";

grant trigger on table "public"."nova_problem_constraints" to "service_role";

grant truncate on table "public"."nova_problem_constraints" to "service_role";

grant update on table "public"."nova_problem_constraints" to "service_role";


