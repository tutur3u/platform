create index concurrently if not exists record_version_user_group_workspace_idx
on audit.record_version (
  (coalesce(record->>'ws_id', old_record->>'ws_id')),
  ts desc,
  id desc
)
where (
  table_schema = 'public' and table_name = 'workspace_user_groups'
) or (
  table_schema = 'private' and table_name = 'user_group_metric_categories'
);
