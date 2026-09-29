-- Category links with a deleted metric still resolve through their category.
create index concurrently if not exists record_version_user_group_workspace_category_idx
on audit.record_version (
  (coalesce(record->>'category_id', old_record->>'category_id')),
  ts desc,
  id desc
)
where table_schema = 'private'
  and table_name = 'user_group_metric_category_links';
