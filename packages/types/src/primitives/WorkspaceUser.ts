export interface WorkspaceUser {
  id: string;
  name?: string;
  full_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  handle?: string | null;
  email?: string | null;
  new_email?: string | null;
  phone?: string | null;
  birthday?: string | null;
  gender?: string | null;
  ethnicity?: string | null;
  guardian?: string | null;
  national_id?: string | null;
  address?: string | null;
  warehouse_id?: string | null;
  note?: string | null;
  ws_id?: string | null;
  default_workspace_id?: string | null;
  linked_users?: {
    id: string;
    display_name: string | null;
  }[];
  href?: string;
  attendance?: WorkspaceUserAttendance[];
  created_at?: string | null;
  deleted?: boolean | null;
}

export interface WorkspaceUserAttendance {
  date: string;
  status: string;
  groups?: {
    id: string;
    name: string;
  }[];
}
