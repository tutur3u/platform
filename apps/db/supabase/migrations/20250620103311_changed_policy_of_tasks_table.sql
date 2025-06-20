alter table "public"."workspace_calendar_tasks" enable row level security;

create policy "allow only user in the workspace to insert"
on "public"."workspace_calendar_tasks"
as permissive
for insert
to authenticated
with check (true);



