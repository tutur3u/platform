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
  archived_at: string | null;
  deleted_at: string | null;
  estimation_type: 'exponential' | 'fibonacci' | 'linear' | 't-shirt' | null;
  extended_estimation: boolean;
  allow_zero_estimates: boolean;
  count_unestimated_issues: boolean;
  task_count?: number;

  template_id?: string;
  ws_id: string;
  href?: string;
  created_at: string | null;
  creator_id: string;
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
