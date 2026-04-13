alter table public.workspace_habit_trackers
  add column if not exists use_case text not null default 'generic',
  add column if not exists template_category text not null default 'custom',
  add column if not exists composer_mode text not null default 'advanced_custom',
  add column if not exists composer_config jsonb not null default '{}'::jsonb;

alter table public.workspace_habit_trackers
  drop constraint if exists workspace_habit_trackers_use_case_check,
  add constraint workspace_habit_trackers_use_case_check
    check (
      use_case in (
        'generic',
        'body_weight',
        'counter',
        'measurement',
        'workout_session',
        'wellness_check'
      )
    ),
  drop constraint if exists workspace_habit_trackers_template_category_check,
  add constraint workspace_habit_trackers_template_category_check
    check (
      template_category in (
        'strength',
        'health',
        'recovery',
        'discipline',
        'custom'
      )
    ),
  drop constraint if exists workspace_habit_trackers_composer_mode_check,
  add constraint workspace_habit_trackers_composer_mode_check
    check (
      composer_mode in (
        'quick_check',
        'quick_increment',
        'measurement',
        'workout_session',
        'advanced_custom'
      )
    ),
  drop constraint if exists workspace_habit_trackers_composer_config_is_object_check,
  add constraint workspace_habit_trackers_composer_config_is_object_check
    check (jsonb_typeof(composer_config) = 'object');
