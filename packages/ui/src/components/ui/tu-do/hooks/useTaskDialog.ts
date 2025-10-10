import { useTaskDialogContext } from '../providers/task-dialog-provider';

/**
 * Hook to open and manage the centralized task dialog
 *
 * Usage:
 * ```tsx
 * const { openTask, createTask, closeDialog } = useTaskDialog();
 *
 * // Open existing task for editing
 * openTask(task, boardId, availableLists);
 *
 * // Create new task
 * createTask(boardId, listId, availableLists);
 * ```
 */
export function useTaskDialog() {
  const { openTask, createTask, closeDialog } = useTaskDialogContext();

  return {
    openTask,
    createTask,
    closeDialog,
  };
}
