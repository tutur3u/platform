-- NON-TRANSACTIONAL: keep this as the only statement; Supabase executes it outside its transaction batch.
-- workspace_storage.object_access resolves template-background reads by (ws_id, background_path).
create index concurrently if not exists board_templates_ws_id_background_path_idx
  on public.board_templates (ws_id, background_path)
  where background_path is not null;
