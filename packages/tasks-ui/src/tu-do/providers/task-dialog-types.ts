import type { WorkspaceProductTier } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { TaskFilters } from '../boards/boardId/task-filter';
import type { SharedTaskContext } from '../shared/task-edit-dialog/hooks/use-task-data';
import type {
  PendingRelationship,
  PendingRelationshipType,
} from '../shared/task-edit-dialog/types/pending-relationship';

export type TaskAssigneeMemberSource =
  | 'workspace'
  | 'board'
  | 'workspace-and-board';

export interface TaskDialogState {
  isOpen: boolean;
  task?: Task;
  boardId?: string;
  mode?: 'edit' | 'create';
  availableLists?: TaskList[];
  collaborationMode?: boolean;
  /** Whether realtime features (Yjs sync, presence avatars) are enabled - true for all tiers */
  realtimeEnabled?: boolean;
  originalPathname?: string;
  filters?: TaskFilters;
  fakeTaskUrl?: boolean;
  parentTaskId?: string; // For creating subtasks (legacy, kept for backward compatibility)
  parentTaskName?: string; // Name of parent task for subtasks (legacy)
  pendingRelationship?: PendingRelationship; // Generic relationship for new tasks
  draftId?: string; // When editing an existing draft
  /** The task's actual workspace ID for correct URL routing (may differ from current wsId) */
  taskWsId?: string;
  /** Whether the task's workspace is personal (affects realtime/presence decisions) */
  taskWorkspacePersonal?: boolean;
  /** Whether the board context should expose assignee controls. */
  canUseBoardAssignees?: boolean;
  /** Where assignee candidates should be loaded from. */
  assigneeMemberSource?: TaskAssigneeMemberSource;
  /** The task workspace tier used to gate cursor tracking for edit mode */
  taskWorkspaceTier?: WorkspaceProductTier;
  /** Initial board/list context used for immediate partial-task rendering. */
  initialSharedContext?: SharedTaskContext;
  /** Board that supplied the visible task card before source-task hydration. */
  visibleBoardId?: string;
  /** Visible task snapshot before hydration, used to preserve overlay metadata. */
  visibleTaskSnapshot?: Partial<Task>;
  /** True while an existing task was opened from a partial snapshot and is hydrating. */
  isHydratingTask?: boolean;
  /** True when the latest hydration request failed after the dialog already opened. */
  taskLoadError?: boolean;
  /** Bumps when async task hydration replaces a partial snapshot. */
  taskHydrationVersion?: number;
  taskOpenRequestId?: number;
}

export interface OpenTaskByIdOptions {
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
  visibleBoardId?: string;
  visibleTaskSnapshot?: Partial<Task>;
}

export interface TaskDialogContextValue {
  // Current dialog state
  state: TaskDialogState;

  // Whether the current workspace is personal
  isPersonalWorkspace: boolean;

  // Open dialog for editing existing task
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
      /** The task's workspace tier (affects cursor tracking) */
      taskWorkspaceTier?: WorkspaceProductTier;
    }
  ) => void;

  // Open task by ID (fetches task data first)
  openTaskById: (
    taskId: string,
    options?: OpenTaskByIdOptions
  ) => Promise<boolean>;

  // Open dialog for creating new task
  createTask: (
    boardId: string,
    listId: string,
    availableLists?: TaskList[],
    filters?: TaskFilters,
    initialTaskValues?: Partial<Task>
  ) => void;

  // Open dialog for creating a subtask (child of existing task)
  createSubtask: (
    parentTaskId: string,
    parentTaskName: string,
    boardId: string,
    listId: string,
    availableLists?: TaskList[]
  ) => void;

  // Open dialog for creating a task with a pending relationship
  createTaskWithRelationship: (
    relationshipType: PendingRelationshipType,
    relatedTaskId: string,
    relatedTaskName: string,
    boardId: string,
    listId: string,
    availableLists?: TaskList[]
  ) => void;

  // Open dialog for editing an existing draft (reuses full TaskEditDialog)
  editDraft: (draft: {
    id: string;
    name: string;
    description?: string | null;
    priority?: string | null;
    board_id?: string | null;
    list_id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    estimation_points?: number | null;
    label_ids?: string[];
    assignee_ids?: string[];
    project_ids?: string[];
  }) => Promise<void>;

  // Close dialog
  closeDialog: () => void;

  // Register callback for when task is updated (returns cleanup function)
  onUpdate: (callback: () => void) => () => void;

  // Register callback for when dialog is closed
  onClose: (callback: () => void) => void;

  // Trigger the registered update callback (internal use)
  triggerUpdate: () => void;

  // Trigger the registered close callback (internal use)
  triggerClose: () => void;

  // Register the active dialog close handler so queued opens can close safely first
  registerCloseRequestHandler: (
    handler: (() => boolean | undefined | Promise<boolean | undefined>) | null
  ) => void;
}
