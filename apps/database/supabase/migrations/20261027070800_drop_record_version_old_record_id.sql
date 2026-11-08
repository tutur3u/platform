-- Drop unused index to reclaim production disk.
drop index concurrently if exists audit.record_version_old_record_id;
