import type { SupportedColor } from './SupportedColors';
import type { Task } from './Task';
import type { TaskList } from './TaskList';

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
  tags?: string[];
  href?: string;
}

export type EnhancedTaskBoard = TaskBoard & {
  href: string;
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  overdueTasks: number;
  progressPercentage: number;
  highPriorityTasks: number;
  mediumPriorityTasks: number;
  lowPriorityTasks: number;
  task_lists?: (TaskList & { tasks: Task[] })[];
};
