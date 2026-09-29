-- Keep this concurrent index as the only statement in this migration.
-- The prior activity index still lists posts and reports under public, but
-- those audit rows now use private. Match user_group_activity_feed's predicate
-- so a date-range read does not scan unrelated platform audit history.
create index concurrently if not exists record_version_user_group_activity_current_ts_idx
on audit.record_version (ts desc, id desc)
where (
  table_schema = 'public'
  and table_name in (
    'workspace_user_groups',
    'workspace_user_groups_users',
    'workspace_user_group_tag_groups',
    'workspace_default_included_user_groups',
    'user_group_attendance',
    'user_group_linked_products',
    'user_group_metrics',
    'user_indicators',
    'user_feedbacks',
    'workspace_course_modules',
    'workspace_course_module_groups'
  )
) or (
  table_schema = 'private'
  and table_name in (
    'user_group_posts',
    'user_group_post_logs',
    'user_group_post_checks',
    'external_user_monthly_reports',
    'external_user_monthly_report_logs',
    'user_group_metric_categories',
    'user_group_metric_category_links'
  )
);
