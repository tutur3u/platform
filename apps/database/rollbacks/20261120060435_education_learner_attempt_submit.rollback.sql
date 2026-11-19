drop function if exists private.submit_education_learner_attempt(
  uuid, uuid, uuid, text, integer, jsonb
);
drop function if exists private.education_learner_attempt_payload(uuid, boolean);
drop function if exists private.education_learner_completed_modules(uuid, uuid, uuid);
drop function if exists private.education_learner_course_quiz_links(uuid, uuid);

drop index if exists private.education_learner_quiz_attempts_idempotency_idx;

alter table private.education_learner_quiz_attempts
  drop constraint if exists education_learner_quiz_attempts_idempotency_key_check;
alter table private.education_learner_quiz_attempts
  drop column if exists idempotency_key;
