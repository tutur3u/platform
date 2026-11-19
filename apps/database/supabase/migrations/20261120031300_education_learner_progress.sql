-- Learner course progress and practice-quiz attempts.
-- The tables live in private. The web route is the only caller: it checks
-- workspace membership, then reads and writes rows for that learner only.
-- Triggers still reject a course, module, or quiz outside the workspace.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.education_learner_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  course_id uuid references public.workspace_user_groups (id) on delete set null,
  attempt_number integer not null,
  correct_count integer not null,
  question_count integer not null,
  total_score real not null,
  duration_seconds integer,
  submitted_at timestamptz not null default now(),
  constraint education_learner_quiz_attempts_attempt_number_check
    check (attempt_number >= 1),
  constraint education_learner_quiz_attempts_counts_check
    check (
      question_count >= 1
      and correct_count >= 0
      and correct_count <= question_count
    ),
  constraint education_learner_quiz_attempts_score_check
    check (total_score >= 0),
  constraint education_learner_quiz_attempts_duration_check
    check (duration_seconds is null or duration_seconds >= 0),
  constraint education_learner_quiz_attempts_learner_number_key
    unique (ws_id, user_id, attempt_number)
);

create table private.education_learner_quiz_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references private.education_learner_quiz_attempts (id) on delete cascade,
  quiz_id uuid not null references public.workspace_quizzes (id) on delete cascade,
  selected_option_id uuid,
  is_correct boolean not null,
  score_awarded real not null default 0,
  created_at timestamptz not null default now(),
  constraint education_learner_quiz_attempt_answers_score_check
    check (score_awarded >= 0),
  constraint education_learner_quiz_attempt_answers_attempt_quiz_key
    unique (attempt_id, quiz_id),
  constraint education_learner_quiz_attempt_answers_option_fkey
    foreign key (selected_option_id, quiz_id)
    references public.quiz_options (id, quiz_id)
    on update cascade
    on delete set null (selected_option_id)
);

create table private.education_learner_module_progress (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  course_id uuid not null references public.workspace_user_groups (id) on delete cascade,
  module_id uuid not null references public.workspace_course_modules (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  completed_at timestamptz not null default now(),
  constraint education_learner_module_progress_learner_module_key
    unique (user_id, module_id)
);

create index education_learner_quiz_attempts_learner_submitted_idx
  on private.education_learner_quiz_attempts (ws_id, user_id, submitted_at desc);

create index education_learner_module_progress_course_idx
  on private.education_learner_module_progress (ws_id, user_id, course_id);

alter table private.education_learner_quiz_attempts enable row level security;
alter table private.education_learner_quiz_attempt_answers enable row level security;
alter table private.education_learner_module_progress enable row level security;

create function private.enforce_education_learner_quiz_attempt_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.course_id is not null and not exists (
    select 1
    from public.workspace_user_groups as course
    where course.id = new.course_id
      and course.ws_id = new.ws_id
  ) then
    raise exception 'course is outside the attempt workspace'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger education_learner_quiz_attempts_scope
  before insert or update on private.education_learner_quiz_attempts
  for each row
  execute function private.enforce_education_learner_quiz_attempt_scope();

create function private.enforce_education_learner_answer_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (
    select 1
    from private.education_learner_quiz_attempts as attempt
    join public.workspace_quizzes as quiz on quiz.id = new.quiz_id
    where attempt.id = new.attempt_id
      and quiz.ws_id = attempt.ws_id
  ) then
    raise exception 'quiz is outside the attempt workspace'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger education_learner_quiz_attempt_answers_scope
  before insert or update on private.education_learner_quiz_attempt_answers
  for each row
  execute function private.enforce_education_learner_answer_scope();

create function private.enforce_education_learner_module_progress_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.workspace_course_modules as module
    join public.workspace_user_groups as course
      on course.id = module.group_id
    where module.id = new.module_id
      and course.id = new.course_id
      and course.ws_id = new.ws_id
  ) then
    raise exception 'module is outside the course workspace'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger education_learner_module_progress_scope
  before insert or update on private.education_learner_module_progress
  for each row
  execute function private.enforce_education_learner_module_progress_scope();

-- Server writes use the service role. These policies keep a direct session,
-- if one is ever granted, limited to the learner and the course workspace.
create policy education_learner_quiz_attempts_select
  on private.education_learner_quiz_attempts
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_org_member((select auth.uid()), ws_id)
    and (
      course_id is null
      or exists (
        select 1
        from public.workspace_user_groups as course
        where course.id = education_learner_quiz_attempts.course_id
          and course.ws_id = education_learner_quiz_attempts.ws_id
      )
    )
  );

create policy education_learner_quiz_attempt_answers_select
  on private.education_learner_quiz_attempt_answers
  for select
  to authenticated
  using (
    exists (
      select 1
      from private.education_learner_quiz_attempts as attempt
      where attempt.id = education_learner_quiz_attempt_answers.attempt_id
        and attempt.user_id = (select auth.uid())
        and public.is_org_member((select auth.uid()), attempt.ws_id)
    )
  );

create policy education_learner_module_progress_select
  on private.education_learner_module_progress
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_org_member((select auth.uid()), ws_id)
    and exists (
      select 1
      from public.workspace_user_groups as course
      join public.workspace_course_modules as module
        on module.group_id = course.id
      where course.id = education_learner_module_progress.course_id
        and course.ws_id = education_learner_module_progress.ws_id
        and module.id = education_learner_module_progress.module_id
    )
  );

create policy education_learner_quiz_attempts_service
  on private.education_learner_quiz_attempts
  for all
  to service_role
  using (true)
  with check (true);

create policy education_learner_quiz_attempt_answers_service
  on private.education_learner_quiz_attempt_answers
  for all
  to service_role
  using (true)
  with check (true);

create policy education_learner_module_progress_service
  on private.education_learner_module_progress
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table private.education_learner_quiz_attempts from public, anon, authenticated;
revoke all on table private.education_learner_quiz_attempt_answers from public, anon, authenticated;
revoke all on table private.education_learner_module_progress from public, anon, authenticated;

grant select, insert, update, delete on table private.education_learner_quiz_attempts to service_role;
grant select, insert, update, delete on table private.education_learner_quiz_attempt_answers to service_role;
grant select, insert, update, delete on table private.education_learner_module_progress to service_role;

revoke all on function private.enforce_education_learner_quiz_attempt_scope() from public, anon, authenticated;
revoke all on function private.enforce_education_learner_answer_scope() from public, anon, authenticated;
revoke all on function private.enforce_education_learner_module_progress_scope() from public, anon, authenticated;
