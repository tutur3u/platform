import type { Database } from '../supabase';

export interface User {
  id?: string | null;
  ws_id?: string | null;
  email?: string | null;
  new_email?: string | null;
  phone?: string | null;
  handle?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  birthday?: string | null;
  pending?: boolean;
  /** From workspace_members_and_invites when listing workspace members */
  workspace_member_type?:
    | Database['public']['Enums']['workspace_member_type']
    | null;
  is_guest?: boolean;
  password_hash?: string;
  created_at?: string | null;
}
