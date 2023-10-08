export interface WorkspaceUser {
  id: string;
  name?: string;
  display_name?: string;
  handle?: string;
  email?: string;
  phone?: string;
  birthday?: string;
  gender?: string;
  ethnicity?: string;
  guardian?: string;
  national_id?: string;
  address?: string;
  warehouse_id?: string;
  note?: string;
  ws_id?: string;
  linked_users?: {
    id: string;
    display_name: string;
  }[];
  created_at?: string;
}
