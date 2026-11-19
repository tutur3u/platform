-- quiz_options stores the answer key. Client roles could read is_correct
-- and points, and could change them. Those grants go away here.
-- service_role keeps authoring and grading. Do not grant the columns back.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

revoke all on table public.quiz_options from public, anon, authenticated;

revoke all privileges (
  id,
  quiz_id,
  value,
  points,
  is_correct,
  created_at,
  explanation
) on table public.quiz_options from public, anon, authenticated;
