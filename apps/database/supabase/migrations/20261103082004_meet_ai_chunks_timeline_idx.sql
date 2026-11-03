-- NON-TRANSACTIONAL: keep this as the only statement; Supabase executes it outside its transaction batch.
-- Deterministic self_v1 keyset pagination: (start_ms, uploader, stream, sequence).
create index concurrently if not exists meet_ai_chunks_timeline_idx
  on public.meet_ai_chunks (session_id, start_ms, account_id, stream_id, sequence)
  where stream_id is not null;
