-- Restate the learner attempt ACL. The helpers stay internal: only
-- submit_education_learner_attempt is callable, and only by service_role.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

revoke all on function private.education_learner_course_quiz_links(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.education_learner_completed_modules(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.education_learner_attempt_payload(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function private.submit_education_learner_attempt(uuid, uuid, uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function private.submit_education_learner_attempt(uuid, uuid, uuid, text, integer, jsonb) to service_role;
