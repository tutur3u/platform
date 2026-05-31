-- Precondition for the pushed 20260531155150 halfvec migration.
-- Clean resets must drop old vector operator-class indexes before changing
-- public.tasks.embedding from vector to halfvec.
drop index if exists public.tasks_embedding_idx;
drop index if exists public.tasks_embedding_hnsw_idx;
