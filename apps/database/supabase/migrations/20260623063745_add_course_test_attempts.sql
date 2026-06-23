create table "public"."course_test_attempts" (
    "id" uuid not null default gen_random_uuid(),
    "test_id" uuid not null,
    "user_id" uuid not null,
    "started_at" timestamp with time zone not null default now(),
    "submitted_at" timestamp with time zone,
    "score" real,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."course_test_attempts" enable row level security;

create table "public"."course_test_attempt_answers" (
    "id" uuid not null default gen_random_uuid(),
    "attempt_id" uuid not null,
    "quiz_id" uuid not null,
    "selected_option_id" uuid,
    "answer" jsonb,
    "is_correct" boolean,
    "score_awarded" real,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."course_test_attempt_answers" enable row level security;

CREATE UNIQUE INDEX course_test_attempts_pkey ON public.course_test_attempts USING btree (id);
CREATE UNIQUE INDEX course_test_attempts_test_user_idx ON public.course_test_attempts USING btree (test_id, user_id);

CREATE UNIQUE INDEX course_test_attempt_answers_pkey ON public.course_test_attempt_answers USING btree (id);
CREATE UNIQUE INDEX course_test_attempt_answers_attempt_quiz_idx ON public.course_test_attempt_answers USING btree (attempt_id, quiz_id);
CREATE UNIQUE INDEX quiz_options_id_quiz_id_idx ON public.quiz_options USING btree (id, quiz_id);

alter table "public"."course_test_attempts" add constraint "course_test_attempts_pkey" PRIMARY KEY using index "course_test_attempts_pkey";
alter table "public"."course_test_attempts" add constraint "course_test_attempts_test_id_fkey" FOREIGN KEY (test_id) REFERENCES course_tests(id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table "public"."course_test_attempts" add constraint "course_test_attempts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;

alter table "public"."course_test_attempt_answers" add constraint "course_test_attempt_answers_pkey" PRIMARY KEY using index "course_test_attempt_answers_pkey";
alter table "public"."course_test_attempt_answers" add constraint "course_test_attempt_answers_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES course_test_attempts(id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table "public"."course_test_attempt_answers" add constraint "course_test_attempt_answers_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES workspace_quizzes(id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table "public"."course_test_attempt_answers" add constraint "course_test_attempt_answers_selected_option_id_fkey" FOREIGN KEY (selected_option_id, quiz_id) REFERENCES quiz_options(id, quiz_id) ON UPDATE CASCADE ON DELETE SET NULL (selected_option_id);

-- Grants for course_test_attempts
grant delete on table "public"."course_test_attempts" to "anon";
grant insert on table "public"."course_test_attempts" to "anon";
grant references on table "public"."course_test_attempts" to "anon";
grant select on table "public"."course_test_attempts" to "anon";
grant trigger on table "public"."course_test_attempts" to "anon";
grant update on table "public"."course_test_attempts" to "anon";

grant delete on table "public"."course_test_attempts" to "authenticated";
grant insert on table "public"."course_test_attempts" to "authenticated";
grant references on table "public"."course_test_attempts" to "authenticated";
grant select on table "public"."course_test_attempts" to "authenticated";
grant trigger on table "public"."course_test_attempts" to "authenticated";
grant update on table "public"."course_test_attempts" to "authenticated";

grant delete on table "public"."course_test_attempts" to "service_role";
grant insert on table "public"."course_test_attempts" to "service_role";
grant references on table "public"."course_test_attempts" to "service_role";
grant select on table "public"."course_test_attempts" to "service_role";
grant trigger on table "public"."course_test_attempts" to "service_role";
grant truncate on table "public"."course_test_attempts" to "service_role";
grant update on table "public"."course_test_attempts" to "service_role";

-- Grants for course_test_attempt_answers
grant delete on table "public"."course_test_attempt_answers" to "anon";
grant insert on table "public"."course_test_attempt_answers" to "anon";
grant references on table "public"."course_test_attempt_answers" to "anon";
grant select on table "public"."course_test_attempt_answers" to "anon";
grant trigger on table "public"."course_test_attempt_answers" to "anon";
grant update on table "public"."course_test_attempt_answers" to "anon";

grant delete on table "public"."course_test_attempt_answers" to "authenticated";
grant insert on table "public"."course_test_attempt_answers" to "authenticated";
grant references on table "public"."course_test_attempt_answers" to "authenticated";
grant select on table "public"."course_test_attempt_answers" to "authenticated";
grant trigger on table "public"."course_test_attempt_answers" to "authenticated";
grant update on table "public"."course_test_attempt_answers" to "authenticated";

grant delete on table "public"."course_test_attempt_answers" to "service_role";
grant insert on table "public"."course_test_attempt_answers" to "service_role";
grant references on table "public"."course_test_attempt_answers" to "service_role";
grant select on table "public"."course_test_attempt_answers" to "service_role";
grant trigger on table "public"."course_test_attempt_answers" to "service_role";
grant truncate on table "public"."course_test_attempt_answers" to "service_role";
grant update on table "public"."course_test_attempt_answers" to "service_role";

-- RLS policies
create policy "Allow select for user who owns attempt"
on "public"."course_test_attempts"
as permissive
for select
to authenticated
using ((auth.uid() = user_id));

create policy "Allow insert for user who owns attempt"
on "public"."course_test_attempts"
as permissive
for insert
to authenticated
with check ((auth.uid() = user_id));

create policy "Allow update for user who owns attempt"
on "public"."course_test_attempts"
as permissive
for update
to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));

create policy "Allow select for user who owns attempt answers"
on "public"."course_test_attempt_answers"
as permissive
for select
to authenticated
using ((exists (select 1 from public.course_test_attempts cta where cta.id = course_test_attempt_answers.attempt_id and cta.user_id = auth.uid())));

create policy "Allow insert for user who owns attempt answers"
on "public"."course_test_attempt_answers"
as permissive
for insert
to authenticated
with check ((exists (select 1 from public.course_test_attempts cta where cta.id = course_test_attempt_answers.attempt_id and cta.user_id = auth.uid())));

create policy "Allow update for user who owns attempt answers"
on "public"."course_test_attempt_answers"
as permissive
for update
to authenticated
using ((exists (select 1 from public.course_test_attempts cta where cta.id = course_test_attempt_answers.attempt_id and cta.user_id = auth.uid())))
with check ((exists (select 1 from public.course_test_attempts cta where cta.id = course_test_attempt_answers.attempt_id and cta.user_id = auth.uid())));

create policy "Allow delete for user who owns attempt answers"
on "public"."course_test_attempt_answers"
as permissive
for delete
to authenticated
using ((exists (select 1 from public.course_test_attempts cta where cta.id = course_test_attempt_answers.attempt_id and cta.user_id = auth.uid())));
