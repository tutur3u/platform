alter table "public"."workspace_calendar_tasks" enable row level security;

create policy "allow only user in the workspace to insert"
on "public"."workspace_calendar_tasks"
as permissive
for insert
to authenticated
with check (true);


alter table "public"."workspace_calendar_tasks" alter column "total_duration" set data type real using "total_duration"::real;


