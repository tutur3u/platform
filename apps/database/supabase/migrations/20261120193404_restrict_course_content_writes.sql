-- Any workspace member could change course content. A learner could set
-- is_quiz_score_published on a module to reveal practice grades and keys,
-- delete a module and cascade away every learner's submissions, release a
-- quiz set, or relink quizzes. A view_user_groups member could also edit
-- quiz links, because those policies only checked that the quiz was visible.
-- Reads keep their existing rules. Writes now need update_user_groups in the
-- workspace of every row they touch; the Teach routes write with
-- service_role after their own checks.
--
-- Learners also lose direct writes to module completion and course
-- certificates. Completion is written by the Learn server; no app writes
-- certificates from a client.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- workspace_course_modules
drop policy if exists "Allow all access for workspace member"
  on public.workspace_course_modules;
drop policy if exists workspace_course_modules_select_members
  on public.workspace_course_modules;
drop policy if exists workspace_course_modules_write_group_managers
  on public.workspace_course_modules;

create policy workspace_course_modules_select_members
  on public.workspace_course_modules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_user_groups as grp
      where grp.id = workspace_course_modules.group_id
        and public.is_org_member((select auth.uid()), grp.ws_id)
    )
  );

create policy workspace_course_modules_write_group_managers
  on public.workspace_course_modules
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_user_groups as grp
      where grp.id = workspace_course_modules.group_id
        and public.has_workspace_permission(grp.ws_id, (select auth.uid()), 'update_user_groups')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_user_groups as grp
      where grp.id = workspace_course_modules.group_id
        and public.has_workspace_permission(grp.ws_id, (select auth.uid()), 'update_user_groups')
    )
  );

-- workspace_quiz_sets
drop policy if exists "Allow all access for workspace member"
  on public.workspace_quiz_sets;
drop policy if exists workspace_quiz_sets_select_members
  on public.workspace_quiz_sets;
drop policy if exists workspace_quiz_sets_write_group_managers
  on public.workspace_quiz_sets;

create policy workspace_quiz_sets_select_members
  on public.workspace_quiz_sets
  for select
  to authenticated
  using (public.is_org_member((select auth.uid()), ws_id));

create policy workspace_quiz_sets_write_group_managers
  on public.workspace_quiz_sets
  for all
  to authenticated
  using (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'update_user_groups')
  )
  with check (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'update_user_groups')
  );

-- course_module_quiz_sets
drop policy if exists "Allow all access for workspace member"
  on public.course_module_quiz_sets;
drop policy if exists course_module_quiz_sets_select_members
  on public.course_module_quiz_sets;
drop policy if exists course_module_quiz_sets_write_group_managers
  on public.course_module_quiz_sets;

create policy course_module_quiz_sets_select_members
  on public.course_module_quiz_sets
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_quiz_sets as quiz_set
      where quiz_set.id = course_module_quiz_sets.set_id
    )
    and exists (
      select 1 from public.workspace_course_modules as module
      where module.id = course_module_quiz_sets.module_id
    )
  );

create policy course_module_quiz_sets_write_group_managers
  on public.course_module_quiz_sets
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_quiz_sets as quiz_set
      where quiz_set.id = course_module_quiz_sets.set_id
        and public.has_workspace_permission(quiz_set.ws_id, (select auth.uid()), 'update_user_groups')
    )
    and exists (
      select 1
      from public.workspace_course_modules as module
      join public.workspace_user_groups as grp
        on grp.id = module.group_id
      where module.id = course_module_quiz_sets.module_id
        and public.has_workspace_permission(grp.ws_id, (select auth.uid()), 'update_user_groups')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_quiz_sets as quiz_set
      where quiz_set.id = course_module_quiz_sets.set_id
        and public.has_workspace_permission(quiz_set.ws_id, (select auth.uid()), 'update_user_groups')
    )
    and exists (
      select 1
      from public.workspace_course_modules as module
      join public.workspace_user_groups as grp
        on grp.id = module.group_id
      where module.id = course_module_quiz_sets.module_id
        and public.has_workspace_permission(grp.ws_id, (select auth.uid()), 'update_user_groups')
    )
  );

-- course_module_quizzes (the original policy name has a leading space)
drop policy if exists " Allow all access for workspace member"
  on public.course_module_quizzes;
drop policy if exists course_module_quizzes_select_members
  on public.course_module_quizzes;
drop policy if exists course_module_quizzes_write_group_managers
  on public.course_module_quizzes;

create policy course_module_quizzes_select_members
  on public.course_module_quizzes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_quizzes as quiz
      where quiz.id = course_module_quizzes.quiz_id
    )
    and exists (
      select 1 from public.workspace_course_modules as module
      where module.id = course_module_quizzes.module_id
    )
  );

create policy course_module_quizzes_write_group_managers
  on public.course_module_quizzes
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_quizzes as quiz
      where quiz.id = course_module_quizzes.quiz_id
        and public.has_workspace_permission(quiz.ws_id, (select auth.uid()), 'update_user_groups')
    )
    and exists (
      select 1
      from public.workspace_course_modules as module
      join public.workspace_user_groups as grp
        on grp.id = module.group_id
      where module.id = course_module_quizzes.module_id
        and public.has_workspace_permission(grp.ws_id, (select auth.uid()), 'update_user_groups')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_quizzes as quiz
      where quiz.id = course_module_quizzes.quiz_id
        and public.has_workspace_permission(quiz.ws_id, (select auth.uid()), 'update_user_groups')
    )
    and exists (
      select 1
      from public.workspace_course_modules as module
      join public.workspace_user_groups as grp
        on grp.id = module.group_id
      where module.id = course_module_quizzes.module_id
        and public.has_workspace_permission(grp.ws_id, (select auth.uid()), 'update_user_groups')
    )
  );

-- quiz_set_quizzes
drop policy if exists "Enable all access for workspace members"
  on public.quiz_set_quizzes;
drop policy if exists quiz_set_quizzes_select_members
  on public.quiz_set_quizzes;
drop policy if exists quiz_set_quizzes_write_group_managers
  on public.quiz_set_quizzes;

create policy quiz_set_quizzes_select_members
  on public.quiz_set_quizzes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_quiz_sets as quiz_set
      where quiz_set.id = quiz_set_quizzes.set_id
    )
    and exists (
      select 1 from public.workspace_quizzes as quiz
      where quiz.id = quiz_set_quizzes.quiz_id
    )
  );

create policy quiz_set_quizzes_write_group_managers
  on public.quiz_set_quizzes
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_quiz_sets as quiz_set
      where quiz_set.id = quiz_set_quizzes.set_id
        and public.has_workspace_permission(quiz_set.ws_id, (select auth.uid()), 'update_user_groups')
    )
    and exists (
      select 1
      from public.workspace_quizzes as quiz
      where quiz.id = quiz_set_quizzes.quiz_id
        and public.has_workspace_permission(quiz.ws_id, (select auth.uid()), 'update_user_groups')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_quiz_sets as quiz_set
      where quiz_set.id = quiz_set_quizzes.set_id
        and public.has_workspace_permission(quiz_set.ws_id, (select auth.uid()), 'update_user_groups')
    )
    and exists (
      select 1
      from public.workspace_quizzes as quiz
      where quiz.id = quiz_set_quizzes.quiz_id
        and public.has_workspace_permission(quiz.ws_id, (select auth.uid()), 'update_user_groups')
    )
  );

-- course_test_quizzes
drop policy if exists "Allow all access for workspace member"
  on public.course_test_quizzes;
drop policy if exists course_test_quizzes_select_members
  on public.course_test_quizzes;
drop policy if exists course_test_quizzes_write_group_managers
  on public.course_test_quizzes;

create policy course_test_quizzes_select_members
  on public.course_test_quizzes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_quizzes as quiz
      where quiz.id = course_test_quizzes.quiz_id
    )
    and exists (
      select 1 from public.course_test_modules as test_module
      where test_module.test_id = course_test_quizzes.test_id
        and test_module.module_id = course_test_quizzes.module_id
    )
  );

create policy course_test_quizzes_write_group_managers
  on public.course_test_quizzes
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_quizzes as quiz
      where quiz.id = course_test_quizzes.quiz_id
        and public.has_workspace_permission(quiz.ws_id, (select auth.uid()), 'update_user_groups')
    )
    and exists (
      select 1
      from public.course_test_modules as test_module
      where test_module.test_id = course_test_quizzes.test_id
        and test_module.module_id = course_test_quizzes.module_id
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_quizzes as quiz
      where quiz.id = course_test_quizzes.quiz_id
        and public.has_workspace_permission(quiz.ws_id, (select auth.uid()), 'update_user_groups')
    )
    and exists (
      select 1
      from public.course_test_modules as test_module
      where test_module.test_id = course_test_quizzes.test_id
        and test_module.module_id = course_test_quizzes.module_id
    )
  );

-- Completion and certificates: learners keep reading their own rows only.
drop policy if exists "Enable insert for users based on user_id"
  on public.course_module_completion_status;
drop policy if exists "Enable update for users based on user_id"
  on public.course_module_completion_status;
drop policy if exists "Enable insert for users based on user_id"
  on public.course_certificates;
drop policy if exists "Enable update for users based on user_id"
  on public.course_certificates;
drop policy if exists "Enable delete for users based on user_id"
  on public.course_certificates;

revoke insert, update, delete, truncate
  on table public.course_module_completion_status
  from public, anon, authenticated;
revoke insert, update, delete, truncate
  on table public.course_certificates
  from public, anon, authenticated;

revoke truncate on table public.workspace_course_modules from anon, authenticated;
revoke truncate on table public.workspace_quiz_sets from anon, authenticated;
revoke truncate on table public.course_module_quiz_sets from anon, authenticated;
revoke truncate on table public.course_module_quizzes from anon, authenticated;
revoke truncate on table public.quiz_set_quizzes from anon, authenticated;
revoke truncate on table public.course_test_quizzes from anon, authenticated;
