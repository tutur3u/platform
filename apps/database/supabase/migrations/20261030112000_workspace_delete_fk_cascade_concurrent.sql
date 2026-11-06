-- NON-TRANSACTIONAL: keep this as the only statement; Supabase executes it outside its transaction batch.
create index concurrently if not exists workspace_documents_ws_id_idx
  on public.workspace_documents (ws_id);
