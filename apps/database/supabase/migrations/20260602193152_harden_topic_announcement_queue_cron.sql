alter table private.topic_announcements
  drop constraint if exists topic_announcements_status_check;

alter table private.topic_announcements
  add constraint topic_announcements_status_check check (
    status in (
      'draft',
      'queued',
      'processing',
      'sent',
      'failed',
      'skipped',
      'cancelled'
    )
  );

create index if not exists topic_announcements_processing_updated_idx
  on private.topic_announcements (updated_at)
  where status = 'processing' and scheduled_send_at is not null;

notify pgrst, 'reload schema';
