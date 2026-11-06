-- Drop unused index to reclaim production disk.
drop index concurrently if exists public.idx_abuse_reputation_subjects_user_seen;
