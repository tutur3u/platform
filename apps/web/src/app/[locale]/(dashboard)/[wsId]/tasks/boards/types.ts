import type {
  Task,
  TaskBoard,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';

export type { Task, TaskBoard, TaskList };

export interface GanttTask extends Task {
  boardId: string;
  boardName: string;
  listName: string;
  listStatus?: string;
  updated_at?: string;
  status?: string;
  [key: string]: unknown;
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
