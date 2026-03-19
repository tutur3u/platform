alter table public.workspace_habits
add column if not exists is_splittable boolean not null default false,
add column if not exists min_instances_per_day integer,
add column if not exists ideal_instances_per_day integer,
add column if not exists max_instances_per_day integer;

alter table public.workspace_habits
drop constraint if exists workspace_habits_min_instances_per_day_check,
drop constraint if exists workspace_habits_ideal_instances_per_day_check,
drop constraint if exists workspace_habits_max_instances_per_day_check,
drop constraint if exists workspace_habits_instance_bounds_check;

alter table public.workspace_habits
add constraint workspace_habits_min_instances_per_day_check
check (
  min_instances_per_day is null
  or min_instances_per_day >= 1
),
add constraint workspace_habits_ideal_instances_per_day_check
check (
  ideal_instances_per_day is null
  or ideal_instances_per_day >= 1
),
add constraint workspace_habits_max_instances_per_day_check
check (
  max_instances_per_day is null
  or max_instances_per_day >= 1
),
add constraint workspace_habits_instance_bounds_check
check (
  (min_instances_per_day is null or ideal_instances_per_day is null or min_instances_per_day <= ideal_instances_per_day)
  and (ideal_instances_per_day is null or max_instances_per_day is null or ideal_instances_per_day <= max_instances_per_day)
  and (min_instances_per_day is null or max_instances_per_day is null or min_instances_per_day <= max_instances_per_day)
);

comment on column public.workspace_habits.is_splittable is 'Whether the habit can be scheduled as multiple instances on the same day.';
comment on column public.workspace_habits.min_instances_per_day is 'Minimum number of instances to schedule per day when the habit is splittable.';
comment on column public.workspace_habits.ideal_instances_per_day is 'Target number of instances to schedule per day when the habit is splittable.';
comment on column public.workspace_habits.max_instances_per_day is 'Maximum number of instances to schedule per day when the habit is splittable.';
