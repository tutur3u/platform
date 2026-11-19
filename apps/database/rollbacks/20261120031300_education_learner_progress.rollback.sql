drop policy if exists education_learner_module_progress_service
  on private.education_learner_module_progress;
drop policy if exists education_learner_quiz_attempt_answers_service
  on private.education_learner_quiz_attempt_answers;
drop policy if exists education_learner_quiz_attempts_service
  on private.education_learner_quiz_attempts;
drop policy if exists education_learner_module_progress_select
  on private.education_learner_module_progress;
drop policy if exists education_learner_quiz_attempt_answers_select
  on private.education_learner_quiz_attempt_answers;
drop policy if exists education_learner_quiz_attempts_select
  on private.education_learner_quiz_attempts;

drop trigger if exists education_learner_module_progress_scope
  on private.education_learner_module_progress;
drop trigger if exists education_learner_quiz_attempt_answers_scope
  on private.education_learner_quiz_attempt_answers;
drop trigger if exists education_learner_quiz_attempts_scope
  on private.education_learner_quiz_attempts;

drop table if exists private.education_learner_quiz_attempt_answers;
drop table if exists private.education_learner_module_progress;
drop table if exists private.education_learner_quiz_attempts;

drop function if exists private.enforce_education_learner_module_progress_scope();
drop function if exists private.enforce_education_learner_answer_scope();
drop function if exists private.enforce_education_learner_quiz_attempt_scope();
