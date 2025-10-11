import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useTaskDialogContext } from '../providers/task-dialog-provider';

/**
 * Hook to open and manage the centralized task dialog
 *
 * Usage:
 * ```tsx
 * const { openTask, createTask, closeDialog, onUpdate } = useTaskDialog();
 *
 * // Open existing task for editing
 * openTask(task, boardId, availableLists);
 *
 * // Create new task
 * createTask(boardId, listId, availableLists);
 *
 * // Register an update callback
 * onUpdate(() => {
 *   // Handle task update (e.g., refresh data)
 * });
 * ```
 */
export function useTaskDialog(): {
  openTask: (task: Task, boardId: string, availableLists?: TaskList[]) => void;
  createTask: (
    boardId: string,
    listId: string,
    availableLists?: TaskList[]
  ) => void;
  closeDialog: () => void;
  onUpdate: (callback: () => void) => void;
} {
  const { openTask, createTask, closeDialog, onUpdate } =
    useTaskDialogContext();

  return {
    openTask,
    createTask,
    closeDialog,
    onUpdate,
  };
}
