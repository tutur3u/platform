import { UserRole } from './User';
import { WorkspacePreset } from './WorkspacePreset';

export interface Workspace {
  id: string;
  handle?: string;
  name?: string;
  role?: UserRole;
  preset?: WorkspacePreset;
  sort_key?: number;
  avatar_url?: string | null;
  logo_url?: string | null;
  created_at?: string | null;
}
