import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { TaskFilters } from '@tuturuuu/ui/tu-do/boards/boardId/task-filter';
import { useTaskDialogContext } from '../providers/task-dialog-provider';

/**
 * Hook to open and manage the centralized task dialog
 *
 * Usage:
 * ```tsx
 * const { openTask, createTask, closeDialog, onUpdate, onClose } = useTaskDialog();
 *
 * // Open existing task for editing
 * openTask(task, boardId, availableLists);
 *
 * // Create new task
 * createTask(boardId, listId, availableLists, filters);
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
  openTask: (task: Task, boardId: string, availableLists?: TaskList[]) => void;
  createTask: (
    boardId: string,
    listId: string,
    availableLists?: TaskList[],
    filters?: TaskFilters
  ) => void;
  closeDialog: () => void;
  onUpdate: (callback: () => void) => void;
  onClose: (callback: () => void) => void;
} {
  const { openTask, createTask, closeDialog, onUpdate, onClose } =
    useTaskDialogContext();

  return {
    openTask,
    createTask,
    closeDialog,
    onUpdate,
    onClose,
  };
}
