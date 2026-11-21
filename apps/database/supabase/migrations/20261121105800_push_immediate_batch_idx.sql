-- NON-TRANSACTIONAL: keep this as the only statement; Supabase executes it outside its transaction batch.
-- Per-user immediate push admission counts recent batches through this index.
create index concurrently if not exists idx_notification_batches_push_immediate_recent
  on private.notification_batches (user_id, created_at)
  where channel = 'push' and delivery_mode = 'immediate';
