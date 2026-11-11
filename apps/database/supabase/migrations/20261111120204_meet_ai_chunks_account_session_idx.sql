-- NON-TRANSACTIONAL: keep this as the only statement; Supabase executes it outside its transaction batch.
-- Own-speech reads and the account FK cascade use this without a room lookup.
create index concurrently if not exists meet_ai_chunks_account_session_idx
  on public.meet_ai_chunks (account_id, session_id) where account_id is not null;
