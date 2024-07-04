export type UserRole = 'MEMBER' | 'ADMIN' | 'OWNER';

export interface User {
  id?: string | null;
  ws_id?: string | null;
  email?: string;
  new_email?: string | null;
  phone?: string | null;
  handle?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  birthday?: string | null;
  pending?: boolean;
  role?: UserRole;
  role_title?: string;
  is_guest?: boolean;
  password_hash?: string;
  created_at?: string | null;
}
