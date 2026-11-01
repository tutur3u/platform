-- NON-TRANSACTIONAL: keep this as the only statement; Supabase executes it outside its transaction batch.
create unique index concurrently if not exists topic_announcements_schedule_slot_unique
  on private.topic_announcements (ws_id, group_id, session_date, start_time)
  where source_type = 'schedule'
    and status <> 'cancelled'
    and group_id is not null
    and session_date is not null
    and start_time is not null;
