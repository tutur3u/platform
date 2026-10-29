-- NON-TRANSACTIONAL: keep this as the only statement; Supabase executes it outside its transaction batch.
create index concurrently if not exists topic_announcements_schedule_stale_claim_idx
  on private.topic_announcements (updated_at)
  where source_type = 'schedule'
    and status = 'processing'
    and scheduled_send_at is null;
