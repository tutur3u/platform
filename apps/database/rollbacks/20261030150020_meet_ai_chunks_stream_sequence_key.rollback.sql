-- NON-TRANSACTIONAL: run alone after the 20261030150050 rollback.
drop index concurrently if exists public.meet_ai_chunks_stream_sequence_key;
