-- NON-TRANSACTIONAL: keep this as the only statement; Supabase executes it outside its transaction batch.
-- Push latency reads accepted push sends by send time through this index.
create index concurrently if not exists idx_notification_delivery_log_push_sent
  on private.notification_delivery_log (sent_at)
  where channel = 'push' and status = 'sent' and error_message is null;
