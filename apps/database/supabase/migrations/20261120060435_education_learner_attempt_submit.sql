-- One transaction records a learner attempt. It checks enrollment, grades
-- from quiz_options, and counts both direct and quiz-set links. The
-- idempotency key is resolved before the rate limit. A raised error rolls
-- the new attempt back, so the 10-per-minute window does not move.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table private.education_learner_quiz_attempts
  add column if not exists idempotency_key text;

alter table private.education_learner_quiz_attempts
  drop constraint if exists education_learner_quiz_attempts_idempotency_key_check;

alter table private.education_learner_quiz_attempts
  add constraint education_learner_quiz_attempts_idempotency_key_check
  check (
    idempotency_key is null
    or char_length(idempotency_key) between 1 and 200
  );

create unique index if not exists education_learner_quiz_attempts_idempotency_idx
  on private.education_learner_quiz_attempts (ws_id, user_id, idempotency_key);

create or replace function private.education_learner_course_quiz_links(
  p_ws_id uuid,
  p_course_id uuid
) returns table (module_id uuid, quiz_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
begin
  return query
  select direct.module_id, direct.quiz_id
  from public.course_module_quizzes as direct
  join public.workspace_course_modules as module
    on module.id = direct.module_id
  join public.workspace_quizzes as quiz
    on quiz.id = direct.quiz_id
  where module.group_id = p_course_id
    and quiz.ws_id = p_ws_id
  union
  select link.module_id, membership.quiz_id
  from public.course_module_quiz_sets as link
  join public.workspace_course_modules as module
    on module.id = link.module_id
  join public.quiz_set_quizzes as membership
    on membership.set_id = link.set_id
  join public.workspace_quizzes as quiz
    on quiz.id = membership.quiz_id
  where module.group_id = p_course_id
    and quiz.ws_id = p_ws_id;
end;
$$;

create or replace function private.education_learner_completed_modules(
  p_attempt_id uuid,
  p_ws_id uuid,
  p_course_id uuid
) returns table (module_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
begin
  return query
  select link.module_id
  from private.education_learner_course_quiz_links(p_ws_id, p_course_id) as link
  group by link.module_id
  having bool_and(
    exists (
      select 1
      from private.education_learner_quiz_attempt_answers as answer
      where answer.attempt_id = p_attempt_id
        and answer.quiz_id = link.quiz_id
        and answer.is_correct
    )
  );
end;
$$;

create or replace function private.education_learner_attempt_payload(
  p_attempt_id uuid,
  p_replayed boolean
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_attempt private.education_learner_quiz_attempts%rowtype;
  v_answers jsonb;
  v_completed jsonb;
begin
  select attempt.*
  into v_attempt
  from private.education_learner_quiz_attempts as attempt
  where attempt.id = p_attempt_id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'quiz_id', answer.quiz_id,
        'selected_option_id', answer.selected_option_id,
        'is_correct', answer.is_correct,
        'score_awarded', answer.score_awarded
      )
      order by answer.created_at, answer.id
    ),
    '[]'::jsonb
  )
  into v_answers
  from private.education_learner_quiz_attempt_answers as answer
  where answer.attempt_id = p_attempt_id;

  select coalesce(
    pg_catalog.jsonb_agg(completed.module_id order by completed.module_id),
    '[]'::jsonb
  )
  into v_completed
  from private.education_learner_completed_modules(
    p_attempt_id,
    v_attempt.ws_id,
    v_attempt.course_id
  ) as completed;

  return pg_catalog.jsonb_build_object(
    'replayed', p_replayed,
    'attempt', pg_catalog.jsonb_build_object(
      'id', v_attempt.id,
      'attempt_number', v_attempt.attempt_number,
      'correct_count', v_attempt.correct_count,
      'question_count', v_attempt.question_count,
      'total_score', v_attempt.total_score,
      'duration_seconds', v_attempt.duration_seconds,
      'submitted_at', v_attempt.submitted_at,
      'completed_at', v_attempt.submitted_at,
      'course_id', v_attempt.course_id,
      'user_id', v_attempt.user_id,
      'answers', v_answers
    ),
    'completed_module_ids', v_completed
  );
end;
$$;

create or replace function private.submit_education_learner_attempt(
  p_ws_id uuid,
  p_user_id uuid,
  p_course_id uuid,
  p_idempotency_key text,
  p_duration_seconds integer,
  p_answers jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_existing_id uuid;
  v_existing_course uuid;
  v_virtual_user uuid;
  v_recent integer;
  v_answer jsonb;
  v_quiz_id uuid;
  v_option_id uuid;
  v_seen uuid[] := '{}';
  v_is_correct boolean;
  v_points real;
  v_quiz_score real;
  v_awarded real;
  v_grades jsonb := '[]'::jsonb;
  v_correct integer := 0;
  v_total integer := 0;
  v_score real := 0;
  v_attempt_number integer;
  v_attempt_id uuid;
begin
  if p_idempotency_key is null
    or char_length(p_idempotency_key) < 1
    or char_length(p_idempotency_key) > 200
    or p_idempotency_key <> btrim(p_idempotency_key)
  then
    raise exception 'idempotency key is invalid'
      using errcode = '22023';
  end if;

  if p_duration_seconds is not null
    and (p_duration_seconds < 0 or p_duration_seconds > 86400)
  then
    raise exception 'duration is invalid'
      using errcode = '22023';
  end if;

  if p_answers is null
    or pg_catalog.jsonb_typeof(p_answers) <> 'array'
    or pg_catalog.jsonb_array_length(p_answers) < 1
    or pg_catalog.jsonb_array_length(p_answers) > 100
  then
    raise exception 'attempt answers are invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_ws_id::text || ':' || p_user_id::text, 0)
  );

  select attempt.id, attempt.course_id
  into v_existing_id, v_existing_course
  from private.education_learner_quiz_attempts as attempt
  where attempt.ws_id = p_ws_id
    and attempt.user_id = p_user_id
    and attempt.idempotency_key = p_idempotency_key;

  if v_existing_id is not null then
    if v_existing_course is distinct from p_course_id then
      raise exception 'idempotency key was already used'
        using errcode = '23514';
    end if;
    return private.education_learner_attempt_payload(v_existing_id, true);
  end if;

  select link.virtual_user_id
  into v_virtual_user
  from public.workspace_user_linked_users as link
  where link.platform_user_id = p_user_id
    and link.ws_id = p_ws_id;

  if v_virtual_user is null or not exists (
    select 1
    from public.workspace_user_groups_users as enrollment
    join public.workspace_user_groups as course
      on course.id = enrollment.group_id
    where enrollment.user_id = v_virtual_user
      and enrollment.group_id = p_course_id
      and course.ws_id = p_ws_id
      and course.archived = false
      and course.is_guest is not true
      and course.is_course_published = true
  ) then
    raise exception 'learner is not enrolled in this course'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into v_recent
  from private.education_learner_quiz_attempts as attempt
  where attempt.ws_id = p_ws_id
    and attempt.user_id = p_user_id
    and attempt.submitted_at > pg_catalog.now() - interval '60 seconds';

  if v_recent >= 10 then
    raise exception 'too many attempts'
      using errcode = 'P4290';
  end if;

  for v_answer in
    select element.value
    from pg_catalog.jsonb_array_elements(p_answers) as element(value)
  loop
    begin
      v_quiz_id := (v_answer ->> 'quiz_id')::uuid;
      v_option_id := (v_answer ->> 'selected_option_id')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'attempt answers are invalid'
          using errcode = '22023';
    end;

    if v_quiz_id is null or v_option_id is null or v_quiz_id = any (v_seen) then
      raise exception 'attempt answers are invalid'
        using errcode = '22023';
    end if;
    v_seen := pg_catalog.array_append(v_seen, v_quiz_id);

    if not exists (
      select 1
      from private.education_learner_course_quiz_links(p_ws_id, p_course_id) as link
      where link.quiz_id = v_quiz_id
    ) then
      raise exception 'quiz is outside this course'
        using errcode = '23514';
    end if;

    select option.is_correct, option.points, quiz.score
    into v_is_correct, v_points, v_quiz_score
    from public.quiz_options as option
    join public.workspace_quizzes as quiz
      on quiz.id = option.quiz_id
    where option.id = v_option_id
      and option.quiz_id = v_quiz_id
      and quiz.ws_id = p_ws_id;

    if not found then
      raise exception 'option does not belong to the quiz'
        using errcode = '23514';
    end if;

    v_awarded := case
      when v_is_correct then coalesce(v_points, v_quiz_score, 0)
      else 0
    end;
    v_total := v_total + 1;
    if v_is_correct then
      v_correct := v_correct + 1;
    end if;
    v_score := v_score + v_awarded;
    v_grades := v_grades || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'quiz_id', v_quiz_id,
        'option_id', v_option_id,
        'is_correct', v_is_correct,
        'score_awarded', v_awarded
      )
    );
  end loop;

  select coalesce(max(attempt.attempt_number), 0) + 1
  into v_attempt_number
  from private.education_learner_quiz_attempts as attempt
  where attempt.ws_id = p_ws_id
    and attempt.user_id = p_user_id;

  insert into private.education_learner_quiz_attempts (
    ws_id,
    user_id,
    course_id,
    attempt_number,
    correct_count,
    question_count,
    total_score,
    duration_seconds,
    idempotency_key
  )
  values (
    p_ws_id,
    p_user_id,
    p_course_id,
    v_attempt_number,
    v_correct,
    v_total,
    v_score,
    p_duration_seconds,
    p_idempotency_key
  )
  returning id into v_attempt_id;

  insert into private.education_learner_quiz_attempt_answers (
    attempt_id,
    quiz_id,
    selected_option_id,
    is_correct,
    score_awarded
  )
  select
    v_attempt_id,
    (grade.value ->> 'quiz_id')::uuid,
    (grade.value ->> 'option_id')::uuid,
    (grade.value ->> 'is_correct')::boolean,
    (grade.value ->> 'score_awarded')::real
  from pg_catalog.jsonb_array_elements(v_grades) as grade(value);

  insert into private.education_learner_module_progress (
    ws_id,
    course_id,
    module_id,
    user_id
  )
  select p_ws_id, p_course_id, completed.module_id, p_user_id
  from private.education_learner_completed_modules(
    v_attempt_id,
    p_ws_id,
    p_course_id
  ) as completed
  on conflict (user_id, module_id) do nothing;

  return private.education_learner_attempt_payload(v_attempt_id, false);
end;
$$;

revoke all on function private.education_learner_course_quiz_links(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.education_learner_completed_modules(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.education_learner_attempt_payload(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.submit_education_learner_attempt(
  uuid, uuid, uuid, text, integer, jsonb
) from public, anon, authenticated, service_role;

grant execute on function private.submit_education_learner_attempt(
  uuid, uuid, uuid, text, integer, jsonb
) to service_role;
