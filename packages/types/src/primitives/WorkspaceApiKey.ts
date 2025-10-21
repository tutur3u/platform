export interface WorkspaceApiKey {
  id?: string;
  ws_id?: string;
  name?: string;
  // Legacy field - kept during migration period, will be removed in future
  value?: string;
  key_hash?: string;
  key_prefix?: string | null;
  description?: string | null;
  role_id?: string | null;
  scopes?: string[];
  expires_at?: string | null;
  last_used_at?: string | null;
  created_at?: string;
  created_by?: string | null;
  updated_at?: string;
}
