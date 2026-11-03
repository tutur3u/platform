-- NON-TRANSACTIONAL: run alone after the 20261103082005 rollback.
drop index concurrently if exists public.meet_ai_chunks_stream_sequence_key;
