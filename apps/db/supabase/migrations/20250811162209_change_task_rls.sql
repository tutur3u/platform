drop policy "Enable insert for users who can access the task" on "public"."task_assignees";

create policy "Enable insert for users who can access the task"
on "public"."task_assignees"
as permissive
for insert
to authenticated
with check (is_task_accessible(task_id));



