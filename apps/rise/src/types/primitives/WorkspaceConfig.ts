export interface WorkspaceConfig {
  id?: string;
  ws_id?: string;
  type?: 'URL' | 'TEXT';
  name?: string;
  value?: string | null;
  updated_at?: string;
  created_at?: string;
}
