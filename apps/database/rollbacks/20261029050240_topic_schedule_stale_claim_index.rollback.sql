-- NON-TRANSACTIONAL: run alone after the consumer rollback commits.
drop index concurrently if exists private.topic_announcements_schedule_stale_claim_idx;
