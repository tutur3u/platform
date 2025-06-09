create table "public"."workspace_quiz_attempt_answers" (
    "id" uuid not null default gen_random_uuid(),
    "attempt_id" uuid not null,
    "quiz_id" uuid not null,
    "selected_option_id" uuid not null,
    "is_correct" boolean not null,
    "score_awarded" real not null
);


create table "public"."workspace_quiz_attempts" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "set_id" uuid not null,
    "attempt_number" integer not null,
    "started_at" timestamp with time zone not null default now(),
    "completed_at" timestamp with time zone,
    "total_score" real
);


alter table "public"."workspace_quiz_sets" add column "attempt_limit" integer;

alter table "public"."workspace_quiz_sets" add column "time_limit_minutes" integer;

alter table "public"."workspace_quizzes" add column "score" integer not null default 1;

CREATE UNIQUE INDEX workspace_quiz_attempts_pkey ON public.workspace_quiz_attempts USING btree (id);

CREATE UNIQUE INDEX wq_answer_pkey ON public.workspace_quiz_attempt_answers USING btree (id);

CREATE UNIQUE INDEX wq_attempts_unique ON public.workspace_quiz_attempts USING btree (user_id, set_id, attempt_number);

alter table "public"."workspace_quiz_attempt_answers" add constraint "wq_answer_pkey" PRIMARY KEY using index "wq_answer_pkey";

alter table "public"."workspace_quiz_attempts" add constraint "workspace_quiz_attempts_pkey" PRIMARY KEY using index "workspace_quiz_attempts_pkey";

alter table "public"."workspace_quiz_attempt_answers" add constraint "wq_answer_attempt_fkey" FOREIGN KEY (attempt_id) REFERENCES workspace_quiz_attempts(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_quiz_attempt_answers" validate constraint "wq_answer_attempt_fkey";

alter table "public"."workspace_quiz_attempt_answers" add constraint "wq_answer_option_fkey" FOREIGN KEY (selected_option_id) REFERENCES quiz_options(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_quiz_attempt_answers" validate constraint "wq_answer_option_fkey";

alter table "public"."workspace_quiz_attempt_answers" add constraint "wq_answer_quiz_fkey" FOREIGN KEY (quiz_id) REFERENCES workspace_quizzes(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_quiz_attempt_answers" validate constraint "wq_answer_quiz_fkey";

alter table "public"."workspace_quiz_attempts" add constraint "wq_attempts_set_fkey" FOREIGN KEY (set_id) REFERENCES workspace_quiz_sets(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_quiz_attempts" validate constraint "wq_attempts_set_fkey";

alter table "public"."workspace_quiz_attempts" add constraint "wq_attempts_unique" UNIQUE using index "wq_attempts_unique";

alter table "public"."workspace_quiz_attempts" add constraint "wq_attempts_user_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_quiz_attempts" validate constraint "wq_attempts_user_fkey";

grant delete on table "public"."workspace_quiz_attempt_answers" to "anon";

grant insert on table "public"."workspace_quiz_attempt_answers" to "anon";

grant references on table "public"."workspace_quiz_attempt_answers" to "anon";

grant select on table "public"."workspace_quiz_attempt_answers" to "anon";

grant trigger on table "public"."workspace_quiz_attempt_answers" to "anon";

grant truncate on table "public"."workspace_quiz_attempt_answers" to "anon";

grant update on table "public"."workspace_quiz_attempt_answers" to "anon";

grant delete on table "public"."workspace_quiz_attempt_answers" to "authenticated";

grant insert on table "public"."workspace_quiz_attempt_answers" to "authenticated";

grant references on table "public"."workspace_quiz_attempt_answers" to "authenticated";

grant select on table "public"."workspace_quiz_attempt_answers" to "authenticated";

grant trigger on table "public"."workspace_quiz_attempt_answers" to "authenticated";

grant truncate on table "public"."workspace_quiz_attempt_answers" to "authenticated";

grant update on table "public"."workspace_quiz_attempt_answers" to "authenticated";

grant delete on table "public"."workspace_quiz_attempt_answers" to "service_role";

grant insert on table "public"."workspace_quiz_attempt_answers" to "service_role";

grant references on table "public"."workspace_quiz_attempt_answers" to "service_role";

grant select on table "public"."workspace_quiz_attempt_answers" to "service_role";

grant trigger on table "public"."workspace_quiz_attempt_answers" to "service_role";

grant truncate on table "public"."workspace_quiz_attempt_answers" to "service_role";

grant update on table "public"."workspace_quiz_attempt_answers" to "service_role";

grant delete on table "public"."workspace_quiz_attempts" to "anon";

grant insert on table "public"."workspace_quiz_attempts" to "anon";

grant references on table "public"."workspace_quiz_attempts" to "anon";

grant select on table "public"."workspace_quiz_attempts" to "anon";

grant trigger on table "public"."workspace_quiz_attempts" to "anon";

grant truncate on table "public"."workspace_quiz_attempts" to "anon";

grant update on table "public"."workspace_quiz_attempts" to "anon";

grant delete on table "public"."workspace_quiz_attempts" to "authenticated";

grant insert on table "public"."workspace_quiz_attempts" to "authenticated";

grant references on table "public"."workspace_quiz_attempts" to "authenticated";

grant select on table "public"."workspace_quiz_attempts" to "authenticated";

grant trigger on table "public"."workspace_quiz_attempts" to "authenticated";

grant truncate on table "public"."workspace_quiz_attempts" to "authenticated";

grant update on table "public"."workspace_quiz_attempts" to "authenticated";

grant delete on table "public"."workspace_quiz_attempts" to "service_role";

grant insert on table "public"."workspace_quiz_attempts" to "service_role";

grant references on table "public"."workspace_quiz_attempts" to "service_role";

grant select on table "public"."workspace_quiz_attempts" to "service_role";

grant trigger on table "public"."workspace_quiz_attempts" to "service_role";

grant truncate on table "public"."workspace_quiz_attempts" to "service_role";

grant update on table "public"."workspace_quiz_attempts" to "service_role";


