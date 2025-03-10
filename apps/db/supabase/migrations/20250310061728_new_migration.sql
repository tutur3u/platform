create table "public"."nova_submission_highest_score" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "highest_score" real,
    "problem_id" uuid
);


alter table "public"."nova_submission_highest_score" enable row level security;

alter table "public"."nova_sessions" drop column "highest_score";

CREATE UNIQUE INDEX nova_submission_highest_score_pkey ON public.nova_submission_highest_score USING btree (id);

alter table "public"."nova_submission_highest_score" add constraint "nova_submission_highest_score_pkey" PRIMARY KEY using index "nova_submission_highest_score_pkey";

grant delete on table "public"."nova_submission_highest_score" to "anon";

grant insert on table "public"."nova_submission_highest_score" to "anon";

grant references on table "public"."nova_submission_highest_score" to "anon";

grant select on table "public"."nova_submission_highest_score" to "anon";

grant trigger on table "public"."nova_submission_highest_score" to "anon";

grant truncate on table "public"."nova_submission_highest_score" to "anon";

grant update on table "public"."nova_submission_highest_score" to "anon";

grant delete on table "public"."nova_submission_highest_score" to "authenticated";

grant insert on table "public"."nova_submission_highest_score" to "authenticated";

grant references on table "public"."nova_submission_highest_score" to "authenticated";

grant select on table "public"."nova_submission_highest_score" to "authenticated";

grant trigger on table "public"."nova_submission_highest_score" to "authenticated";

grant truncate on table "public"."nova_submission_highest_score" to "authenticated";

grant update on table "public"."nova_submission_highest_score" to "authenticated";

grant delete on table "public"."nova_submission_highest_score" to "service_role";

grant insert on table "public"."nova_submission_highest_score" to "service_role";

grant references on table "public"."nova_submission_highest_score" to "service_role";

grant select on table "public"."nova_submission_highest_score" to "service_role";

grant trigger on table "public"."nova_submission_highest_score" to "service_role";

grant truncate on table "public"."nova_submission_highest_score" to "service_role";

grant update on table "public"."nova_submission_highest_score" to "service_role";


