-- Drop unused index to reclaim production disk.
drop index concurrently if exists public.idx_abuse_activity_signals_type_created;
