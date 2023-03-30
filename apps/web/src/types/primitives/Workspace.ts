import { WorkspacePreset } from './WorkspacePreset';

export interface Workspace {
  id: string;
  handle?: string;
  name?: string;
  preset?: WorkspacePreset;
  created_at?: string;
}
