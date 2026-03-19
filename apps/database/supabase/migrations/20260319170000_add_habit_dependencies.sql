alter table public.workspace_habits
add column if not exists dependency_habit_id uuid references public.workspace_habits(id) on delete set null,
add column if not exists dependency_type text;

alter table public.workspace_habits
drop constraint if exists workspace_habits_dependency_type_check,
drop constraint if exists workspace_habits_dependency_pair_check,
drop constraint if exists workspace_habits_dependency_not_self_check;

alter table public.workspace_habits
add constraint workspace_habits_dependency_type_check
check (
  dependency_type is null
  or dependency_type in ('after', 'before')
),
add constraint workspace_habits_dependency_pair_check
check (
  (dependency_habit_id is null and dependency_type is null)
  or (dependency_habit_id is not null and dependency_type is not null)
),
add constraint workspace_habits_dependency_not_self_check
check (
  dependency_habit_id is null
  or dependency_habit_id <> id
);

comment on column public.workspace_habits.dependency_habit_id is 'Another habit that this habit must be scheduled before or after.';
comment on column public.workspace_habits.dependency_type is 'Whether this habit should be scheduled before or after dependency_habit_id.';
