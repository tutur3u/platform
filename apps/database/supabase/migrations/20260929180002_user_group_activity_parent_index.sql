create index concurrently if not exists record_version_user_group_parent_idx
on audit.record_version (
  (coalesce(
    record->>'post_id', old_record->>'post_id',
    record->>'metric_id', old_record->>'metric_id',
    record->>'indicator_id', old_record->>'indicator_id',
    record->>'report_id', old_record->>'report_id'
  )),
  ts desc,
  id desc
)
where (
  table_schema = 'public' and table_name = 'user_indicators'
) or (
  table_schema = 'private' and table_name in (
    'user_group_post_logs', 'user_group_post_checks',
    'user_group_metric_category_links', 'external_user_monthly_report_logs'
  )
);
