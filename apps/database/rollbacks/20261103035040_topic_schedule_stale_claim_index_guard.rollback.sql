-- Guard and index comment only; the following concurrent-index rollback removes the index and its comment.
comment on index private.topic_announcements_schedule_stale_claim_idx is null;
