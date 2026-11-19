-- Repeatable. Policies and triggers disappear with the tables, so a second
-- run must not drop them again after the tables are already gone.
-- Children go before the attempt table. Functions last.
drop table if exists private.education_learner_quiz_attempt_answers;
drop table if exists private.education_learner_module_progress;
drop table if exists private.education_learner_quiz_attempts;

drop function if exists private.enforce_education_learner_module_progress_scope();
drop function if exists private.enforce_education_learner_answer_scope();
drop function if exists private.enforce_education_learner_quiz_attempt_scope();
