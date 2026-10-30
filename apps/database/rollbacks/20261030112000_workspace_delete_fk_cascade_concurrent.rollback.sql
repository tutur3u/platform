-- NON-TRANSACTIONAL: run alone after the consumer rollback commits.
-- Preserve this index if it existed before this rollout.
drop index concurrently if exists public.workspace_documents_ws_id_idx;
