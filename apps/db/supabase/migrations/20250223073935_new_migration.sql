create table "public"."nova_problem_testcases" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "constraint_content" text,
    "problem_id" uuid default gen_random_uuid()
);


alter table "public"."nova_problem_testcases" enable row level security;

CREATE UNIQUE INDEX nova_problem_testcases_pkey ON public.nova_problem_testcases USING btree (id);

alter table "public"."nova_problem_testcases" add constraint "nova_problem_testcases_pkey" PRIMARY KEY using index "nova_problem_testcases_pkey";

grant delete on table "public"."nova_problem_testcases" to "anon";

grant insert on table "public"."nova_problem_testcases" to "anon";

grant references on table "public"."nova_problem_testcases" to "anon";

grant select on table "public"."nova_problem_testcases" to "anon";

grant trigger on table "public"."nova_problem_testcases" to "anon";

grant truncate on table "public"."nova_problem_testcases" to "anon";

grant update on table "public"."nova_problem_testcases" to "anon";

grant delete on table "public"."nova_problem_testcases" to "authenticated";

grant insert on table "public"."nova_problem_testcases" to "authenticated";

grant references on table "public"."nova_problem_testcases" to "authenticated";

grant select on table "public"."nova_problem_testcases" to "authenticated";

grant trigger on table "public"."nova_problem_testcases" to "authenticated";

grant truncate on table "public"."nova_problem_testcases" to "authenticated";

grant update on table "public"."nova_problem_testcases" to "authenticated";

grant delete on table "public"."nova_problem_testcases" to "service_role";

grant insert on table "public"."nova_problem_testcases" to "service_role";

grant references on table "public"."nova_problem_testcases" to "service_role";

grant select on table "public"."nova_problem_testcases" to "service_role";

grant trigger on table "public"."nova_problem_testcases" to "service_role";

grant truncate on table "public"."nova_problem_testcases" to "service_role";

grant update on table "public"."nova_problem_testcases" to "service_role";


