export type UserRole = 'MEMBER' | 'ADMIN' | 'OWNER';

export interface User {
  id: string;
  email?: string;
  new_email?: string | null;
  phone?: string | null;
  handle?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  birthday?: string | null;
  role?: UserRole;
  role_title?: string;
  created_at?: string;
}
