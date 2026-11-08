-- Not a migration: apply manually only with release-authority approval; run each statement separately (CONCURRENTLY)
create index concurrently if not exists idx_abuse_activity_signals_subject_created on public.abuse_activity_signals using btree (subject_type, subject_key, created_at desc);
create index concurrently if not exists idx_abuse_activity_signals_ip_created on public.abuse_activity_signals using btree (ip_address, created_at desc) where (ip_address is not null);
create index concurrently if not exists idx_abuse_activity_signals_user_created on public.abuse_activity_signals using btree (user_id, created_at desc) where (user_id is not null);
create index concurrently if not exists idx_abuse_activity_signals_type_created on public.abuse_activity_signals using btree (signal_type, created_at desc);
create index concurrently if not exists idx_abuse_reputation_subjects_tier_seen on public.abuse_reputation_subjects using btree (tier, last_seen_at desc);
create index concurrently if not exists idx_abuse_reputation_subjects_user_seen on public.abuse_reputation_subjects using btree (user_id, last_seen_at desc) where (user_id is not null);
create index concurrently if not exists idx_abuse_reputation_subjects_ip_seen on public.abuse_reputation_subjects using btree (ip_address, last_seen_at desc) where (ip_address is not null);
create index concurrently if not exists record_version_record_id on audit.record_version using btree (record_id) where (record_id is not null);
create index concurrently if not exists record_version_old_record_id on audit.record_version using btree (old_record_id) where (old_record_id is not null);
