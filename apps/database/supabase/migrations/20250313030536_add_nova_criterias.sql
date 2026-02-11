create table "public"."nova_challenge_criterias" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "value" text not null,
    "challenge_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."nova_challenge_criterias" enable row level security;

create table "public"."nova_problem_criteria_scores" (
    "problem_id" uuid not null,
    "criteria_id" uuid not null,
    "score" integer not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."nova_problem_criteria_scores" enable row level security;

alter table "public"."nova_sessions" drop column "total_score";

CREATE UNIQUE INDEX nova_challenge_criterias_pkey ON public.nova_challenge_criterias USING btree (id);

CREATE UNIQUE INDEX nova_problem_criteria_scores_pkey ON public.nova_problem_criteria_scores USING btree (problem_id, criteria_id);

alter table "public"."nova_challenge_criterias" add constraint "nova_challenge_criterias_pkey" PRIMARY KEY using index "nova_challenge_criterias_pkey";

alter table "public"."nova_problem_criteria_scores" add constraint "nova_problem_criteria_scores_pkey" PRIMARY KEY using index "nova_problem_criteria_scores_pkey";

alter table "public"."nova_challenge_criterias" add constraint "nova_challenge_criterias_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES nova_challenges(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_challenge_criterias" validate constraint "nova_challenge_criterias_challenge_id_fkey";

alter table "public"."nova_problem_criteria_scores" add constraint "nova_problem_criteria_scores_criteria_id_fkey" FOREIGN KEY (criteria_id) REFERENCES nova_challenge_criterias(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_problem_criteria_scores" validate constraint "nova_problem_criteria_scores_criteria_id_fkey";

alter table "public"."nova_problem_criteria_scores" add constraint "nova_problem_criteria_scores_problem_id_fkey" FOREIGN KEY (problem_id) REFERENCES nova_problems(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_problem_criteria_scores" validate constraint "nova_problem_criteria_scores_problem_id_fkey";

grant delete on table "public"."nova_challenge_criterias" to "anon";

grant insert on table "public"."nova_challenge_criterias" to "anon";

grant references on table "public"."nova_challenge_criterias" to "anon";

grant select on table "public"."nova_challenge_criterias" to "anon";

grant trigger on table "public"."nova_challenge_criterias" to "anon";

grant truncate on table "public"."nova_challenge_criterias" to "anon";

grant update on table "public"."nova_challenge_criterias" to "anon";

grant delete on table "public"."nova_challenge_criterias" to "authenticated";

grant insert on table "public"."nova_challenge_criterias" to "authenticated";

grant references on table "public"."nova_challenge_criterias" to "authenticated";

grant select on table "public"."nova_challenge_criterias" to "authenticated";

grant trigger on table "public"."nova_challenge_criterias" to "authenticated";

grant truncate on table "public"."nova_challenge_criterias" to "authenticated";

grant update on table "public"."nova_challenge_criterias" to "authenticated";

grant delete on table "public"."nova_challenge_criterias" to "service_role";

grant insert on table "public"."nova_challenge_criterias" to "service_role";

grant references on table "public"."nova_challenge_criterias" to "service_role";

grant select on table "public"."nova_challenge_criterias" to "service_role";

grant trigger on table "public"."nova_challenge_criterias" to "service_role";

grant truncate on table "public"."nova_challenge_criterias" to "service_role";

grant update on table "public"."nova_challenge_criterias" to "service_role";

grant delete on table "public"."nova_problem_criteria_scores" to "anon";

grant insert on table "public"."nova_problem_criteria_scores" to "anon";

grant references on table "public"."nova_problem_criteria_scores" to "anon";

grant select on table "public"."nova_problem_criteria_scores" to "anon";

grant trigger on table "public"."nova_problem_criteria_scores" to "anon";

grant truncate on table "public"."nova_problem_criteria_scores" to "anon";

grant update on table "public"."nova_problem_criteria_scores" to "anon";

grant delete on table "public"."nova_problem_criteria_scores" to "authenticated";

grant insert on table "public"."nova_problem_criteria_scores" to "authenticated";

grant references on table "public"."nova_problem_criteria_scores" to "authenticated";

grant select on table "public"."nova_problem_criteria_scores" to "authenticated";

grant trigger on table "public"."nova_problem_criteria_scores" to "authenticated";

grant truncate on table "public"."nova_problem_criteria_scores" to "authenticated";

grant update on table "public"."nova_problem_criteria_scores" to "authenticated";

grant delete on table "public"."nova_problem_criteria_scores" to "service_role";

grant insert on table "public"."nova_problem_criteria_scores" to "service_role";

grant references on table "public"."nova_problem_criteria_scores" to "service_role";

grant select on table "public"."nova_problem_criteria_scores" to "service_role";

grant trigger on table "public"."nova_problem_criteria_scores" to "service_role";

grant truncate on table "public"."nova_problem_criteria_scores" to "service_role";

grant update on table "public"."nova_problem_criteria_scores" to "service_role";


