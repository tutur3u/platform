import { UserRole } from './User';
import { WorkspacePreset } from './WorkspacePreset';

export interface Workspace {
  id: string;
  handle?: string;
  name?: string;
  role?: UserRole;
  preset?: WorkspacePreset;
  sort_key?: number;
  created_at?: string | null;
}
