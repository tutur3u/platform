export interface WorkspaceUser {
  id: string;
  name?: string;
  full_name?: string;
  display_name?: string;
  avatar_url?: string | null;
  handle?: string;
  email?: string;
  new_email?: string;
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
  href?: string;
  attendance?: WorkspaceUserAttendance[];
  created_at?: string;
}

export interface WorkspaceUserAttendance {
  date: string;
  status: string;
  groups?: {
    id: string;
    name: string;
  }[];
}
