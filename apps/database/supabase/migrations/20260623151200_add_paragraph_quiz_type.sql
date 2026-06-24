alter table "public"."workspace_quizzes"
  drop constraint "workspace_quizzes_type_check",
  add constraint "workspace_quizzes_type_check"
  check ("type" in ('true_false', 'multiple_choice', 'matching', 'ordering', 'paragraph'));
