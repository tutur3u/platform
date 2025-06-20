import { SupportedColor } from './SupportedColors';

// Task Board Status - Used for organizing tasks into workflow stages
// NOTE: This is different from AI module TaskStatus which has different values
// Do not confuse with: 'not-started', 'in-progress', 'completed', 'blocked'
export type TaskBoardStatus = 'not_started' | 'active' | 'done' | 'closed';

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

export interface TaskBoard {
  id: string;
  name: string;
  archived: boolean;
  deleted: boolean;
  created_at: string;
  creator_id: string;
  ws_id: string;
  template_id?: string;
  href?: string;
}

export interface TaskList {
  id: string;
  name: string;
  archived: boolean;
  deleted: boolean;
  created_at: string;
  board_id: string;
  creator_id: string;
  status: TaskBoardStatus;
  color: SupportedColor;
  position: number;
  href?: string;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  list_id: string;
  priority?: number | null;
  start_date?: string;
  end_date?: string | null;
  archived: boolean;
  created_at: string;
  assignees?: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
    handle?: string;
  }[];
}

export interface TaskAssignee {
  task_id: string;
  user_id: string;
  created_at: string;
}
