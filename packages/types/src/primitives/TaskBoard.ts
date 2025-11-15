import type { SupportedColor } from './SupportedColors';

// Task Board Status - Used for organizing tasks into workflow stages
// NOTE: This is different from AI module TaskStatus which has different values
// Do not confuse with: 'not-started', 'in-progress', 'completed', 'blocked'
export type TaskBoardStatus =
  | 'documents'
  | 'not_started'
  | 'active'
  | 'done'
  | 'closed';

export interface TaskBoardStatusTemplate {
  id: string;
  name: string;
  description?: string;
  statuses: TaskBoardStatusDefinition[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskBoardStatusDefinition {
  status: TaskBoardStatus;
  name: string;
  color: SupportedColor;
  allow_multiple: boolean;
}
