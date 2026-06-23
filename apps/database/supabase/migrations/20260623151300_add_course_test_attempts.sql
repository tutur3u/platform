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
grant references on table "public"."course_test_attempts" to "anon";
grant select on table "public"."course_test_attempts" to "anon";
grant trigger on table "public"."course_test_attempts" to "anon";

grant references on table "public"."course_test_attempts" to "authenticated";
grant select on table "public"."course_test_attempts" to "authenticated";
grant trigger on table "public"."course_test_attempts" to "authenticated";

grant delete on table "public"."course_test_attempts" to "service_role";
grant insert on table "public"."course_test_attempts" to "service_role";
grant references on table "public"."course_test_attempts" to "service_role";
grant select on table "public"."course_test_attempts" to "service_role";
grant trigger on table "public"."course_test_attempts" to "service_role";
grant truncate on table "public"."course_test_attempts" to "service_role";
grant update on table "public"."course_test_attempts" to "service_role";

-- Grants for course_test_attempt_answers
grant references on table "public"."course_test_attempt_answers" to "anon";
grant select on table "public"."course_test_attempt_answers" to "anon";
grant trigger on table "public"."course_test_attempt_answers" to "anon";

grant references on table "public"."course_test_attempt_answers" to "authenticated";
grant select on table "public"."course_test_attempt_answers" to "authenticated";
grant trigger on table "public"."course_test_attempt_answers" to "authenticated";

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

create policy "Allow select for user who owns attempt answers"
on "public"."course_test_attempt_answers"
as permissive
for select
to authenticated
using ((exists (select 1 from public.course_test_attempts cta where cta.id = course_test_attempt_answers.attempt_id and cta.user_id = auth.uid())));

create or replace function "public"."upsert_course_test_question"(
  "p_ws_id" uuid,
  "p_test_id" uuid,
  "p_module_id" uuid,
  "p_quiz" jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_quiz_id uuid;
  v_option jsonb;
begin
  if p_quiz ? 'id' and nullif(p_quiz ->> 'id', '') is not null then
    v_quiz_id := (p_quiz ->> 'id')::uuid;

    update public.workspace_quizzes
    set
      question = p_quiz ->> 'question',
      type = case when p_quiz ? 'type' then p_quiz ->> 'type' else type end,
      content = case when p_quiz ? 'content' then p_quiz -> 'content' else content end
    where id = v_quiz_id
      and ws_id = p_ws_id
      and exists (
        select 1
        from public.course_test_quizzes ctq
        where ctq.test_id = p_test_id
          and ctq.module_id = p_module_id
          and ctq.quiz_id = v_quiz_id
      )
    returning id into v_quiz_id;

    if not found then
      raise exception 'Quiz not found for test module' using errcode = 'P0002';
    end if;
  else
    insert into public.workspace_quizzes (
      question,
      ws_id,
      type,
      content
    )
    values (
      p_quiz ->> 'question',
      p_ws_id,
      coalesce(nullif(p_quiz ->> 'type', ''), 'multiple_choice'),
      case when p_quiz ? 'content' then p_quiz -> 'content' else null end
    )
    returning id into v_quiz_id;
  end if;

  if p_quiz ? 'answer' then
    if p_quiz -> 'answer' = 'null'::jsonb then
      delete from private.workspace_quiz_answers
      where quiz_id = v_quiz_id;

      update public.workspace_quizzes
      set answer = null
      where id = v_quiz_id;
    else
      insert into private.workspace_quiz_answers (
        quiz_id,
        answer
      )
      values (
        v_quiz_id,
        p_quiz -> 'answer'
      )
      on conflict (quiz_id)
      do update set
        answer = excluded.answer,
        updated_at = now();
    end if;
  end if;

  insert into public.course_test_quizzes (
    test_id,
    module_id,
    quiz_id
  )
  values (
    p_test_id,
    p_module_id,
    v_quiz_id
  )
  on conflict do nothing;

  if p_quiz ? 'quiz_options' then
    delete from public.quiz_options
    where quiz_id = v_quiz_id;

    for v_option in
      select value from jsonb_array_elements(coalesce(p_quiz -> 'quiz_options', '[]'::jsonb))
    loop
      insert into public.quiz_options (
        quiz_id,
        value,
        is_correct,
        explanation
      )
      values (
        v_quiz_id,
        v_option ->> 'value',
        coalesce((v_option ->> 'is_correct')::boolean, false),
        nullif(v_option ->> 'explanation', '')
      );
    end loop;
  end if;

  return v_quiz_id;
end;
$$;

revoke all on function "public"."upsert_course_test_question"(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function "public"."upsert_course_test_question"(uuid, uuid, uuid, jsonb) to service_role;
