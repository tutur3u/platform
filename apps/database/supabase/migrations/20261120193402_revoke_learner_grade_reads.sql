-- Test attempts, test answers and practice submissions carry grades.
-- Learners could read their own rows directly, so scores and correctness
-- showed before the teacher released them. Practice submissions also
-- accepted a client-written is_correct.
-- Client roles lose every grant here. The Learn server reads and writes
-- these rows with service_role and withholds scores until release; Teach
-- reads them with service_role after its permission check.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop policy if exists "Allow select for user who owns attempt"
  on public.course_test_attempts;
drop policy if exists "Allow select for user who owns attempt answers"
  on public.course_test_attempt_answers;
drop policy if exists enable_users_to_insert_own_submissions
  on public.course_module_quiz_submissions;
drop policy if exists enable_users_to_view_own_submissions
  on public.course_module_quiz_submissions;

revoke all on table public.course_test_attempts
  from public, anon, authenticated;
revoke all on table public.course_test_attempt_answers
  from public, anon, authenticated;
revoke all on table public.course_module_quiz_submissions
  from public, anon, authenticated;
