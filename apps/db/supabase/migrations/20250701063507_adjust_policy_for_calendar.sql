drop policy "Enable all access for tasks in accessible task list" on "public"."tasks";

create policy "Enable all access for tasks in accessible task list"
on "public"."tasks"
as permissive
for all
to authenticated
using (((list_id IS NULL) OR (EXISTS ( SELECT 1
   FROM task_lists tl
  WHERE (tl.id = tasks.list_id)))))
with check (((list_id IS NULL) OR (EXISTS ( SELECT 1
   FROM task_lists tl
  WHERE (tl.id = tasks.list_id)))));



