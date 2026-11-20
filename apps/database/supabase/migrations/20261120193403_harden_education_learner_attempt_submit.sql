-- Follows 20261120060435, which stays unchanged.
--
-- Practice quizzes have one definition, education_learner_practice_quizzes.
-- The web practice GET serves it and the submit RPC accepts only it:
--   * the course is published, not archived and not a guest group;
--   * the first 20 published modules by (sort_key, id), on both the direct
--     and the quiz-set branch;
--   * multiple-choice quizzes in the workspace with at least two options;
--   * quiz sets in the workspace;
--   * at most 20 distinct quizzes, in module order, direct links first.
-- Unpublished modules, other quiz types and foreign quiz sets no longer
-- grade or complete modules.
--
-- Submit locks workspace membership, the learner link, the course and
-- enrollment before returning a replay or grading a new attempt.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.education_learner_practice_quizzes(
  p_ws_id uuid,
  p_course_id uuid
) returns table (module_id uuid, quiz_id uuid, quiz_position integer)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with modules as (
    select
      module.id,
      pg_catalog.row_number() over (
        order by module.sort_key, module.id
      ) as module_rank
    from public.workspace_course_modules as module
    join public.workspace_user_groups as course
      on course.id = module.group_id
    where module.group_id = p_course_id
      and course.ws_id = p_ws_id
      and course.archived = false
      and course.is_guest is not true
      and course.is_course_published = true
      and module.is_published = true
    order by module.sort_key, module.id
    limit 20
  ),
  candidates as (
    select
      modules.id as module_id,
      modules.module_rank,
      0 as source_rank,
      null::uuid as set_id,
      quiz.created_at,
      quiz.id as quiz_id
    from modules
    join public.course_module_quizzes as direct
      on direct.module_id = modules.id
    join public.workspace_quizzes as quiz
      on quiz.id = direct.quiz_id
    where quiz.ws_id = p_ws_id
      and quiz.type = 'multiple_choice'
    union all
    select
      modules.id,
      modules.module_rank,
      1,
      link.set_id,
      quiz.created_at,
      quiz.id
    from modules
    join public.course_module_quiz_sets as link
      on link.module_id = modules.id
    join public.workspace_quiz_sets as quiz_set
      on quiz_set.id = link.set_id
    join public.quiz_set_quizzes as membership
      on membership.set_id = link.set_id
    join public.workspace_quizzes as quiz
      on quiz.id = membership.quiz_id
    where quiz_set.ws_id = p_ws_id
      and quiz.ws_id = p_ws_id
      and quiz.type = 'multiple_choice'
  ),
  eligible as (
    select
      candidate.*,
      pg_catalog.row_number() over (
        order by
          candidate.module_rank,
          candidate.source_rank,
          candidate.set_id nulls first,
          candidate.created_at,
          candidate.quiz_id
      ) as link_rank
    from candidates as candidate
    where (
      select count(*)
      from public.quiz_options as option
      where option.quiz_id = candidate.quiz_id
    ) >= 2
  ),
  capped as (
    select
      first_seen.quiz_id,
      pg_catalog.row_number() over (order by first_seen.first_rank) as quiz_position
    from (
      select eligible.quiz_id, min(eligible.link_rank) as first_rank
      from eligible
      group by eligible.quiz_id
    ) as first_seen
    order by first_seen.first_rank
    limit 20
  )
  select distinct eligible.module_id, eligible.quiz_id, capped.quiz_position::integer
  from eligible
  join capped
    on capped.quiz_id = eligible.quiz_id;
$$;

-- tuturuuu: no-grant (internal)
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
  select practice.module_id, practice.quiz_id
  from private.education_learner_practice_quizzes(p_ws_id, p_course_id) as practice;
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
  v_allowed uuid[];
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

  perform 1
  from public.workspace_members as member
  where member.ws_id = p_ws_id
    and member.user_id = p_user_id
  for share;

  if not found then
    raise exception 'learner is not enrolled in this course'
      using errcode = '42501';
  end if;

  -- Continue in learner link, course, enrollment order.
  select link.virtual_user_id
  into v_virtual_user
  from public.workspace_user_linked_users as link
  where link.platform_user_id = p_user_id
    and link.ws_id = p_ws_id
  for share;

  if v_virtual_user is null then
    raise exception 'learner is not enrolled in this course'
      using errcode = '42501';
  end if;

  perform 1
  from public.workspace_user_groups as course
  where course.id = p_course_id
    and course.ws_id = p_ws_id
    and course.archived = false
    and course.is_guest is not true
    and course.is_course_published = true
  for share;

  if not found then
    raise exception 'learner is not enrolled in this course'
      using errcode = '42501';
  end if;

  perform 1
  from public.workspace_user_groups_users as enrollment
  where enrollment.user_id = v_virtual_user
    and enrollment.group_id = p_course_id
  for share;

  if not found then
    raise exception 'learner is not enrolled in this course'
      using errcode = '42501';
  end if;

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

  select coalesce(pg_catalog.array_agg(distinct link.quiz_id), '{}')
  into v_allowed
  from private.education_learner_course_quiz_links(p_ws_id, p_course_id) as link;

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

    if not (v_quiz_id = any (v_allowed)) then
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

revoke all on function private.education_learner_practice_quizzes(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.education_learner_course_quiz_links(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.submit_education_learner_attempt(
  uuid, uuid, uuid, text, integer, jsonb
) from public, anon, authenticated, service_role;

-- The practice GET reads the list; submit is the only writer.
grant execute on function private.education_learner_practice_quizzes(uuid, uuid)
  to service_role;
grant execute on function private.submit_education_learner_attempt(
  uuid, uuid, uuid, text, integer, jsonb
) to service_role;
