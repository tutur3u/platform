create index concurrently idx_workspace_api_keys_key_prefix
  on public.workspace_api_keys (key_prefix);
