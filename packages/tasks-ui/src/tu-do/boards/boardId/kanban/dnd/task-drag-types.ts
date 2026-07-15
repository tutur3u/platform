import type { Task } from '@tuturuuu/types/primitives/Task';

export type TaskDropPosition = 'before' | 'after';

export type VerticalRect = {
  height: number;
  top: number;
};

export type TaskRect = VerticalRect & {
  originalIndex?: number;
  taskId: string;
};

export type DragPreviewPosition = {
  insertionIndex: number;
  listId: string;
  task: Task;
  height: number;
};

export type DragCacheSnapshot = {
  tasks?: Task[];
  fullTasks?: Task[];
};

export type DragSessionMetrics = {
  activeInitialRect: VerticalRect | null;
  activeTaskId: string;
  height: number;
  sourceInsertionIndex: number;
  sourceListId: string;
};

export type TaskSortKeyRepair = {
  listId: string;
  sortKey: number;
  taskId: string;
};
