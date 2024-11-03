import { UserRole } from './User';

export interface Workspace {
  id: string;
  handle?: string;
  name?: string;
  role?: UserRole;
  joined?: boolean;
  sort_key?: number;
  avatar_url?: string | null;
  logo_url?: string | null;
  created_at?: string | null;
}
