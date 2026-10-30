-- NON-TRANSACTIONAL: keep this as the only statement; Supabase executes it outside its transaction batch.
-- self_v1 identity is per stream: two participants may both upload sequence 0.
create unique index concurrently if not exists meet_ai_chunks_stream_sequence_key
  on public.meet_ai_chunks (session_id, stream_id, sequence) where stream_id is not null;
