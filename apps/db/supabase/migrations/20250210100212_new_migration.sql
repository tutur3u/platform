create table "public"."nova_users_problem_history" (
    "id" bigint generated by default as identity not null,
    "created_at" timestamp with time zone not null default now(),
    "problemId" uuid,
    "userId" uuid,
    "score" real,
    "feedback" character varying
);


alter table "public"."nova_users_problem_history" enable row level security;

CREATE UNIQUE INDEX nova_users_problem_history_pkey ON public.nova_users_problem_history USING btree (id);

alter table "public"."nova_users_problem_history" add constraint "nova_users_problem_history_pkey" PRIMARY KEY using index "nova_users_problem_history_pkey";

alter table "public"."nova_users_problem_history" add constraint "nova_users_problem_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES workspace_users(id) not valid;

alter table "public"."nova_users_problem_history" validate constraint "nova_users_problem_history_userId_fkey";

grant delete on table "public"."nova_users_problem_history" to "anon";

grant insert on table "public"."nova_users_problem_history" to "anon";

grant references on table "public"."nova_users_problem_history" to "anon";

grant select on table "public"."nova_users_problem_history" to "anon";

grant trigger on table "public"."nova_users_problem_history" to "anon";

grant truncate on table "public"."nova_users_problem_history" to "anon";

grant update on table "public"."nova_users_problem_history" to "anon";

grant delete on table "public"."nova_users_problem_history" to "authenticated";

grant insert on table "public"."nova_users_problem_history" to "authenticated";

grant references on table "public"."nova_users_problem_history" to "authenticated";

grant select on table "public"."nova_users_problem_history" to "authenticated";

grant trigger on table "public"."nova_users_problem_history" to "authenticated";

grant truncate on table "public"."nova_users_problem_history" to "authenticated";

grant update on table "public"."nova_users_problem_history" to "authenticated";

grant delete on table "public"."nova_users_problem_history" to "service_role";

grant insert on table "public"."nova_users_problem_history" to "service_role";

grant references on table "public"."nova_users_problem_history" to "service_role";

grant select on table "public"."nova_users_problem_history" to "service_role";

grant trigger on table "public"."nova_users_problem_history" to "service_role";

grant truncate on table "public"."nova_users_problem_history" to "service_role";

grant update on table "public"."nova_users_problem_history" to "service_role";


