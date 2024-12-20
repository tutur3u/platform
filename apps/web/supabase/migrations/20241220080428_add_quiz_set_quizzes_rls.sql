create policy "Enable all access for workspace members"
on "public"."quiz_set_quizzes"
as permissive
for all
to authenticated
using (((EXISTS ( SELECT 1
   FROM workspace_quiz_sets wqs
  WHERE (wqs.id = quiz_set_quizzes.set_id))) AND (EXISTS ( SELECT 1
   FROM workspace_quizzes wq
  WHERE (wq.id = quiz_set_quizzes.quiz_id)))))
with check (((EXISTS ( SELECT 1
   FROM workspace_quiz_sets wqs
  WHERE (wqs.id = quiz_set_quizzes.set_id))) AND (EXISTS ( SELECT 1
   FROM workspace_quizzes wq
  WHERE (wq.id = quiz_set_quizzes.quiz_id)))));



