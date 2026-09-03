create index concurrently idx_workspace_api_keys_key_prefix
  on public.workspace_api_keys (key_prefix)
  where key_prefix is not null;
