alter table public.workspace_course_modules
add column if not exists vocabulary jsonb not null default '[]'::jsonb;

update public.workspace_course_modules
set vocabulary = '[]'::jsonb
where vocabulary is null;
