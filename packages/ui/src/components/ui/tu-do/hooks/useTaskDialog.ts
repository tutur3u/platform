import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { TaskFilters } from '@tuturuuu/ui/tu-do/boards/boardId/task-filter';
import {
  type PendingRelationshipType,
  useTaskDialogContext,
} from '../providers/task-dialog-provider';

/**
 * Hook to open and manage the centralized task dialog
 *
 * Usage:
 * ```tsx
 * const { openTask, createTask, createSubtask, createTaskWithRelationship, closeDialog, onUpdate, onClose } = useTaskDialog();
 *
 * // Open existing task for editing
 * openTask(task, boardId, availableLists);
 *
 * // Create new task
 * createTask(boardId, listId, availableLists, filters);
 *
 * // Create subtask (child of existing task)
 * createSubtask(parentTaskId, boardId, listId, availableLists);
 *
 * // Create task with any relationship type
 * createTaskWithRelationship('parent', relatedTaskId, relatedTaskName, boardId, listId, availableLists);
 *
 * // Register an update callback
 * onUpdate(() => {
 *   // Handle task update (e.g., refresh data)
 * });
 *
 * // Register a close callback
 * onClose(() => {
 *   // Handle dialog close (e.g., navigate back)
 * });
 * ```
 */
export function useTaskDialog(): {
  openTask: (
    task: Task,
    boardId: string,
    availableLists?: TaskList[],
    fakeTaskUrl?: boolean
  ) => void;
  openTaskById: (taskId: string) => Promise<void>;
  createTask: (
    boardId: string,
    listId: string,
    availableLists?: TaskList[],
    filters?: TaskFilters
  ) => void;
  createSubtask: (
    parentTaskId: string,
    parentTaskName: string,
    boardId: string,
    listId: string,
    availableLists?: TaskList[]
  ) => void;
  createTaskWithRelationship: (
    relationshipType: PendingRelationshipType,
    relatedTaskId: string,
    relatedTaskName: string,
    boardId: string,
    listId: string,
    availableLists?: TaskList[]
  ) => void;
  closeDialog: () => void;
  onUpdate: (callback: () => void) => () => void;
  onClose: (callback: () => void) => void;
} {
  const {
    openTask,
    openTaskById,
    createTask,
    createSubtask,
    createTaskWithRelationship,
    closeDialog,
    onUpdate,
    onClose,
  } = useTaskDialogContext();

  return {
    openTask,
    openTaskById,
    createTask,
    createSubtask,
    createTaskWithRelationship,
    closeDialog,
    onUpdate,
    onClose,
  };
}
