import { WorkspacePreset } from './WorkspacePreset';

export interface Workspace {
  id: string;
  handle?: string;
  name?: string;
  preset?: WorkspacePreset;
  sort_key?: number;
  created_at?: string;
}
