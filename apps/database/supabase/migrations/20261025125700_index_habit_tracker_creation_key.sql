-- Keep this as the only statement: Supabase runs it outside its transaction batch.
create unique index concurrently if not exists idx_workspace_habit_trackers_creation_key_active
  on public.workspace_habit_trackers (ws_id, created_by, creation_key)
  where creation_key is not null and archived_at is null and is_active;
