import type { WorkspaceProductTier } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { TaskFilters } from '@tuturuuu/ui/tu-do/boards/boardId/task-filter';
import {
  type PendingRelationshipType,
  type TaskAssigneeMemberSource,
  useTaskDialogContext,
} from '../providers/task-dialog-provider';
import type { SharedTaskContext } from '../shared/task-edit-dialog/hooks/use-task-data';

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
 * createTask(boardId, listId, availableLists, filters, initialTaskValues);
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
    fakeTaskUrl?: boolean,
    options?: {
      preserveUrl?: boolean;
      /** The task's actual workspace ID for correct URL routing */
      taskWsId?: string;
      /** Whether the task's workspace is personal (affects realtime features) */
      taskWorkspacePersonal?: boolean;
      /** Whether the board context should expose assignee controls */
      canUseBoardAssignees?: boolean;
      /** Where assignee candidates should be loaded from */
      assigneeMemberSource?: TaskAssigneeMemberSource;
    }
  ) => void;
  openTaskById: (
    taskId: string,
    options?: {
      initialTask?: Partial<Task>;
      boardId?: string;
      availableLists?: TaskList[];
      fakeTaskUrl?: boolean;
      taskWsId?: string;
      taskWorkspacePersonal?: boolean;
      taskWorkspaceTier?: WorkspaceProductTier;
      canUseBoardAssignees?: boolean;
      assigneeMemberSource?: TaskAssigneeMemberSource;
      initialSharedContext?: SharedTaskContext;
    }
  ) => Promise<boolean>;
  createTask: (
    boardId: string,
    listId: string,
    availableLists?: TaskList[],
    filters?: TaskFilters,
    initialTaskValues?: Partial<Task>
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
