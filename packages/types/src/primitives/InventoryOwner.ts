export interface InventoryOwner {
  id: string;
  name: string;
  ws_id?: string;
  linked_workspace_user_id?: string | null;
  avatar_url?: string | null;
  archived?: boolean;
  created_at?: string;
  updated_at?: string;
}
