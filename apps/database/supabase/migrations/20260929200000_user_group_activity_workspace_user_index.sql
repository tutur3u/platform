-- The workspace-wide orphan feed starts from workspace users, then reads
-- only their feedback and indicator audit rows.
create index concurrently if not exists record_version_user_group_workspace_user_idx
on audit.record_version (
  (coalesce(record->>'user_id', old_record->>'user_id')),
  ts desc,
  id desc
)
where table_schema = 'public'
  and table_name in ('user_feedbacks', 'user_indicators');
