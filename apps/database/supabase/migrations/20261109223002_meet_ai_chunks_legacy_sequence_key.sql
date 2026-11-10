-- NON-TRANSACTIONAL: keep this as the only statement; Supabase executes it outside its transaction batch.
-- Legacy rows keep the original global (session, sequence) identity.
create unique index concurrently if not exists meet_ai_chunks_legacy_sequence_key
  on public.meet_ai_chunks (session_id, sequence) where stream_id is null;
