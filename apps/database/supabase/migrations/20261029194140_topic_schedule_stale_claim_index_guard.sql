-- IF NOT EXISTS must not accept an invalid index from an interrupted build.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_index
    where indexrelid = pg_catalog.to_regclass('private.topic_announcements_schedule_stale_claim_idx')
      and indrelid = 'private.topic_announcements'::regclass and indisvalid
  ) then
    raise exception using errcode = '55000',
      message = 'Required index topic_announcements_schedule_stale_claim_idx is missing or invalid',
      hint = 'Drop the invalid index concurrently outside a transaction, resolve duplicates if applicable, rebuild, and retry.';
  end if;
end;
$$;
-- Partial index for the queue's stale schedule claim sweep
-- (failStaleScheduleClaims in apps/web/src/lib/topic-schedule/send-claim.ts).
-- Every queue run fails schedule sessions left 'processing' by a Send now that
-- never finished:
--   source_type = 'schedule' and status = 'processing'
--   and scheduled_send_at is null and updated_at < cutoff
-- The predicate matches that filter exactly, so the sweep reads an almost
-- empty index (sessions are 'processing' only for seconds) instead of
-- scanning private.topic_announcements. No behaviour change.
set local lock_timeout = '5s';
set local statement_timeout = '60s';



comment on index private.topic_announcements_schedule_stale_claim_idx is
  'Serves the queue sweep that fails stale schedule Send now claims.';
