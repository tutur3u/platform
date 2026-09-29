-- One concurrent index per migration; the candidate feed's direct branch
-- repeats this exact predicate so PostgreSQL can use the expression lookup.
create index concurrently if not exists record_version_user_group_direct_group_idx
on audit.record_version (
  (coalesce(record->>'group_id', old_record->>'group_id')),
  ts desc,
  id desc
)
where (
  table_schema = 'public' and table_name in (
    'workspace_user_groups_users', 'workspace_user_group_tag_groups',
    'workspace_default_included_user_groups', 'user_group_attendance',
    'user_group_linked_products', 'user_group_metrics', 'user_feedbacks',
    'workspace_course_modules', 'workspace_course_module_groups'
  )
) or (
  table_schema = 'private' and table_name in (
    'user_group_posts', 'external_user_monthly_reports'
  )
);
