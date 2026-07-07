'use client';

import type { WorkspaceProductTier } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { TaskFilters } from '@tuturuuu/ui/tu-do/boards/boardId/task-filter';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SharedTaskContext } from '../shared/task-edit-dialog/hooks/use-task-data';
import type {
  PendingRelationship,
  PendingRelationshipType,
} from '../shared/task-edit-dialog/types/pending-relationship';
import { useOptionalWorkspacePresenceContext } from './workspace-presence-provider';

export type { PendingRelationship, PendingRelationshipType };

export type TaskAssigneeMemberSource =
  | 'workspace'
  | 'board'
  | 'workspace-and-board';

type WorkspaceLabelSummary = {
  id: string;
  name: string | null;
  color: string | null;
  created_at: string | null;
};

type WorkspaceMemberSummary = {
  id: string;
  user_id?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

interface TaskDialogState {
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

interface OpenTaskByIdOptions {
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

interface TaskDialogContextValue {
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

const TaskDialogContext = createContext<TaskDialogContextValue | null>(null);

export function useTaskDialogContext() {
  const context = useContext(TaskDialogContext);
  if (!context) {
    throw new Error(
      'useTaskDialogContext must be used within TaskDialogProvider'
    );
  }
  return context;
}

interface TaskDialogProviderProps {
  children: ReactNode;
  onUpdate?: () => void;
  isPersonalWorkspace?: boolean;
}

export function TaskDialogProvider({
  children,
  onUpdate: externalOnUpdate,
  isPersonalWorkspace = false,
}: TaskDialogProviderProps) {
  const [state, setState] = useState<TaskDialogState>({
    isOpen: false,
  });
  const stateRef = useRef(state);
  const isDialogOpenRef = useRef(state.isOpen);
  const queuedDialogStatesRef = useRef<TaskDialogState[]>([]);
  const queuedOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskOpenRequestIdRef = useRef(0);
  const closeRequestHandlerRef = useRef<
    (() => boolean | undefined | Promise<boolean | undefined>) | null
  >(null);
  const closeRequestInFlightRef = useRef(false);

  // Read cursorsEnabled from workspace presence context (true in DEV_MODE or PRO+ tiers)
  // Note: realtimeEnabled is NOT read from context — it's derived from the task's own
  // workspace (personal vs team) to avoid cross-workspace context pollution.
  const wsPresence = useOptionalWorkspacePresenceContext();
  const cursorsEnabled = wsPresence?.cursorsEnabled ?? false;

  const canUseTaskCursors = useCallback(
    (
      isTaskWorkspacePersonal: boolean,
      taskWorkspaceTier?: WorkspaceProductTier
    ) => {
      if (isTaskWorkspacePersonal) return false;
      if (taskWorkspaceTier) return taskWorkspaceTier !== 'FREE';
      return cursorsEnabled;
    },
    [cursorsEnabled]
  );

  // Store all update callbacks in a ref set for multiple registrations
  const updateCallbacksRef = useRef<Set<() => void>>(new Set());
  // Store the close callback in a ref for dynamic registration
  const closeCallbackRef = useRef<(() => void) | null>(null);

  const registerCloseRequestHandler = useCallback(
    (
      handler: (() => boolean | undefined | Promise<boolean | undefined>) | null
    ) => {
      closeRequestHandlerRef.current = handler;
    },
    []
  );

  const flushQueuedDialogState = useCallback(() => {
    if (
      queuedOpenTimerRef.current ||
      queuedDialogStatesRef.current.length === 0
    ) {
      return;
    }

    const nextDialogState = queuedDialogStatesRef.current.shift();
    if (!nextDialogState) {
      return;
    }

    queuedOpenTimerRef.current = setTimeout(() => {
      queuedOpenTimerRef.current = null;
      setState(nextDialogState);
    }, 0);
  }, []);

  const closeDialog = useCallback(() => {
    setState({
      isOpen: false,
    });
  }, []);

  const queueDialogState = useCallback(
    (nextDialogState: TaskDialogState) => {
      if (
        !isDialogOpenRef.current &&
        !queuedOpenTimerRef.current &&
        queuedDialogStatesRef.current.length === 0
      ) {
        setState(nextDialogState);
        return;
      }

      queuedDialogStatesRef.current.push(nextDialogState);

      if (closeRequestInFlightRef.current || !isDialogOpenRef.current) {
        return;
      }

      closeRequestInFlightRef.current = true;

      const requestClose = closeRequestHandlerRef.current;

      if (requestClose) {
        void Promise.resolve(requestClose())
          .then((closeAccepted) => {
            if (closeAccepted === false) {
              closeRequestInFlightRef.current = false;
            }
          })
          .catch((error) => {
            closeRequestInFlightRef.current = false;
            console.error('Failed to request task dialog close:', error);
          });
        return;
      }

      closeDialog();
    },
    [closeDialog]
  );

  const replaceHydratingDialogState = useCallback(
    (requestId: number, nextDialogState: TaskDialogState) => {
      queuedDialogStatesRef.current = queuedDialogStatesRef.current.map(
        (queuedDialogState) =>
          queuedDialogState.taskOpenRequestId === requestId
            ? nextDialogState
            : queuedDialogState
      );

      setState((currentState) =>
        currentState.taskOpenRequestId === requestId
          ? nextDialogState
          : currentState
      );
    },
    []
  );

  const markHydratingDialogFailed = useCallback((requestId: number) => {
    queuedDialogStatesRef.current = queuedDialogStatesRef.current.map(
      (queuedDialogState) =>
        queuedDialogState.taskOpenRequestId === requestId
          ? {
              ...queuedDialogState,
              isHydratingTask: false,
              taskLoadError: true,
              taskHydrationVersion:
                (queuedDialogState.taskHydrationVersion ?? 0) + 1,
            }
          : queuedDialogState
    );

    setState((currentState) =>
      currentState.taskOpenRequestId === requestId
        ? {
            ...currentState,
            isHydratingTask: false,
            taskLoadError: true,
            taskHydrationVersion: (currentState.taskHydrationVersion ?? 0) + 1,
          }
        : currentState
    );
  }, []);

  useEffect(() => {
    stateRef.current = state;
    isDialogOpenRef.current = state.isOpen;

    if (state.isOpen) {
      return;
    }

    closeRequestInFlightRef.current = false;
    flushQueuedDialogState();
  }, [flushQueuedDialogState, state]);

  useEffect(() => {
    return () => {
      if (queuedOpenTimerRef.current) {
        clearTimeout(queuedOpenTimerRef.current);
      }
    };
  }, []);

  const openTask = useCallback(
    (
      task: Task,
      boardId: string,
      availableLists?: TaskList[],
      fakeTaskUrl?: boolean,
      options?: {
        preserveUrl?: boolean;
        taskWsId?: string;
        taskWorkspacePersonal?: boolean;
        canUseBoardAssignees?: boolean;
        assigneeMemberSource?: TaskAssigneeMemberSource;
        taskWorkspaceTier?: WorkspaceProductTier;
      }
    ) => {
      // Use task's workspace personal flag if provided, otherwise fall back to current workspace
      const isTaskWorkspacePersonal =
        options?.taskWorkspacePersonal ?? isPersonalWorkspace;

      // Realtime sync (auto-save via Yjs) is always enabled in edit mode.
      // Cursor presence requires tier check and non-personal workspace.
      const shouldEnableCursors = canUseTaskCursors(
        isTaskWorkspacePersonal,
        options?.taskWorkspaceTier
      );

      queueDialogState({
        isOpen: true,
        task,
        boardId,
        mode: 'edit',
        availableLists,
        collaborationMode: shouldEnableCursors,
        realtimeEnabled: true,
        fakeTaskUrl,
        taskWsId: options?.taskWsId,
        taskWorkspacePersonal: isTaskWorkspacePersonal,
        canUseBoardAssignees:
          options?.canUseBoardAssignees ?? !isTaskWorkspacePersonal,
        assigneeMemberSource: options?.assigneeMemberSource,
        taskWorkspaceTier: options?.taskWorkspaceTier,
      });
    },
    [canUseTaskCursors, isPersonalWorkspace, queueDialogState]
  );

  const openTaskById = useCallback(
    async (taskId: string, options?: OpenTaskByIdOptions) => {
      const requestId = taskOpenRequestIdRef.current + 1;
      taskOpenRequestIdRef.current = requestId;

      const initialTaskSnapshot = options?.initialTask;
      const now = new Date().toISOString();
      const initialTask = {
        name: '',
        description: '',
        list_id: '',
        display_number: 0,
        created_at: now,
        updated_at: now,
        deleted: false,
        archived: false,
        labels: [],
        assignees: [],
        projects: [],
        ...initialTaskSnapshot,
        id: taskId,
      } as Task;
      const initialTaskWithBoard = initialTaskSnapshot as
        | (Partial<Task> & {
            board_id?: string | null;
            list?: { board_id?: string | null } | null;
          })
        | undefined;
      const initialBoardId =
        options?.boardId ??
        initialTaskWithBoard?.board_id ??
        initialTaskWithBoard?.list?.board_id ??
        undefined;
      const initialTaskWorkspacePersonal =
        options?.taskWorkspacePersonal ?? isPersonalWorkspace;

      const initialDialogState: TaskDialogState = {
        isOpen: true,
        task: initialTask,
        boardId: initialBoardId,
        mode: 'edit',
        availableLists: options?.availableLists,
        collaborationMode: false,
        realtimeEnabled: false,
        fakeTaskUrl: options?.fakeTaskUrl,
        taskWsId: options?.taskWsId,
        taskWorkspacePersonal: initialTaskWorkspacePersonal,
        canUseBoardAssignees:
          options?.canUseBoardAssignees ?? !initialTaskWorkspacePersonal,
        assigneeMemberSource: options?.assigneeMemberSource,
        taskWorkspaceTier: options?.taskWorkspaceTier,
        initialSharedContext: options?.initialSharedContext,
        visibleBoardId: options?.visibleBoardId,
        visibleTaskSnapshot: options?.visibleTaskSnapshot,
        isHydratingTask: true,
        taskLoadError: false,
        taskHydrationVersion: 0,
        taskOpenRequestId: requestId,
      };
      const currentState = stateRef.current;

      if (
        currentState.isOpen &&
        currentState.task?.id === taskId &&
        currentState.taskLoadError
      ) {
        setState(initialDialogState);
      } else {
        queueDialogState(initialDialogState);
      }

      try {
        const { getTaskDialogHydration } = await import(
          '@tuturuuu/internal-api/tasks'
        );

        const response = await getTaskDialogHydration(
          taskId,
          {
            taskWsId: options?.taskWsId,
            taskWorkspacePersonal: options?.taskWorkspacePersonal,
            taskWorkspaceTier: options?.taskWorkspaceTier,
          },
          {
            fetch: (input, init) =>
              fetch(new URL(String(input), window.location.origin).toString(), {
                ...init,
                cache: 'no-store',
              }),
          }
        );

        if (!response) {
          markHydratingDialogFailed(requestId);
          return false;
        }

        const transformedTask = response.task as Task & {
          board_id?: string | null;
          list?: {
            board_id?: string | null;
          } | null;
        };
        const taskWsId = response.taskWsId;
        const taskWorkspacePersonal = response.taskWorkspacePersonal;
        const taskWorkspaceTier = response.taskWorkspaceTier;
        const isTaskWorkspacePersonal =
          taskWorkspacePersonal ?? initialTaskWorkspacePersonal;

        // Realtime sync (auto-save via Yjs) is always enabled in edit mode.
        // Cursor presence requires tier check and non-personal workspace.
        const shouldEnableCursors = canUseTaskCursors(
          isTaskWorkspacePersonal,
          taskWorkspaceTier
        );

        replaceHydratingDialogState(requestId, {
          isOpen: true,
          task: transformedTask as Task,
          boardId:
            transformedTask.board_id ??
            transformedTask.list?.board_id ??
            initialBoardId,
          mode: 'edit',
          availableLists:
            response.availableLists || options?.availableLists || undefined,
          collaborationMode: shouldEnableCursors,
          realtimeEnabled: true,
          fakeTaskUrl: options?.fakeTaskUrl,
          taskWsId,
          taskWorkspacePersonal: isTaskWorkspacePersonal,
          canUseBoardAssignees:
            options?.canUseBoardAssignees ?? !isTaskWorkspacePersonal,
          assigneeMemberSource: options?.assigneeMemberSource,
          taskWorkspaceTier,
          visibleBoardId: options?.visibleBoardId,
          visibleTaskSnapshot: options?.visibleTaskSnapshot,
          isHydratingTask: false,
          taskLoadError: false,
          taskHydrationVersion: 1,
          taskOpenRequestId: requestId,
        });
        return true;
      } catch {
        markHydratingDialogFailed(requestId);
        return false;
      }
    },
    [
      canUseTaskCursors,
      isPersonalWorkspace,
      markHydratingDialogFailed,
      queueDialogState,
      replaceHydratingDialogState,
    ]
  );

  const createTask = useCallback(
    (
      boardId: string,
      listId: string,
      availableLists?: TaskList[],
      filters?: TaskFilters,
      initialTaskValues?: Partial<Task>
    ) => {
      const task = Object.assign(
        {
          id: 'new',
          name: '',
          display_number: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted: false,
          archived: false,
        },
        initialTaskValues,
        {
          id: 'new',
          list_id: listId,
        }
      ) as Task;

      queueDialogState({
        isOpen: true,
        task,
        boardId,
        mode: 'create',
        availableLists,
        collaborationMode: false,
        filters,
      });
    },
    [queueDialogState]
  );

  const createSubtask = useCallback(
    (
      parentTaskId: string,
      parentTaskName: string,
      boardId: string,
      listId: string,
      availableLists?: TaskList[]
    ) => {
      queueDialogState({
        isOpen: true,
        task: {
          id: 'new',
          name: '',
          list_id: listId,
          display_number: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted: false,
          archived: false,
        } as Task,
        boardId,
        mode: 'create',
        availableLists,
        collaborationMode: false,
        parentTaskId,
        parentTaskName,
      });
    },
    [queueDialogState]
  );

  const createTaskWithRelationship = useCallback(
    (
      relationshipType: PendingRelationshipType,
      relatedTaskId: string,
      relatedTaskName: string,
      boardId: string,
      listId: string,
      availableLists?: TaskList[]
    ) => {
      queueDialogState({
        isOpen: true,
        task: {
          id: 'new',
          name: '',
          list_id: listId,
          display_number: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted: false,
          archived: false,
        } as Task,
        boardId,
        mode: 'create',
        availableLists,
        collaborationMode: false,
        pendingRelationship: {
          type: relationshipType,
          relatedTaskId,
          relatedTaskName,
        },
      });
    },
    [queueDialogState]
  );

  const editDraft = useCallback(
    async (draft: {
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
    }) => {
      const { resolveTaskProjectWorkspaceId } = await import(
        '@tuturuuu/internal-api/tasks'
      );
      const workspaceId = await resolveTaskProjectWorkspaceId({
        boardId: draft.board_id ?? undefined,
        projectIds: draft.project_ids,
      });

      if (!workspaceId) {
        throw new Error('Unable to resolve draft workspace');
      }

      // Fetch label metadata so names/colors render correctly
      let labels: Array<{
        id: string;
        name: string;
        color: string;
        created_at: string;
      }> = [];
      if (draft.label_ids && draft.label_ids.length > 0) {
        const { listWorkspaceLabels } = await import(
          '@tuturuuu/internal-api/tasks'
        );
        const data = await listWorkspaceLabels(workspaceId);
        labels = data
          .filter((label: WorkspaceLabelSummary) =>
            draft.label_ids?.includes(label.id)
          )
          .map((l: WorkspaceLabelSummary) => ({
            id: l.id,
            name: l.name ?? '',
            color: l.color ?? '',
            created_at: l.created_at ?? '',
          }));
      }

      // Fetch assignee metadata so display names/avatars render correctly
      let assignees: Array<{
        id: string;
        user_id: string;
        display_name?: string | null;
        avatar_url?: string | null;
      }> = [];
      if (draft.assignee_ids && draft.assignee_ids.length > 0) {
        const { listWorkspaceMembers } = await import(
          '@tuturuuu/internal-api/workspaces'
        );
        const data = await listWorkspaceMembers(workspaceId);
        assignees = data
          .filter((user: WorkspaceMemberSummary) =>
            Boolean(user.user_id && draft.assignee_ids?.includes(user.user_id))
          )
          .map((u: WorkspaceMemberSummary) => ({
            id: u.id,
            user_id: u.user_id || u.id,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
          }));
      }

      // Fetch project metadata so names render correctly
      let projects: Array<{
        id: string;
        name: string;
        status: string | null;
      }> = [];
      if (draft.project_ids && draft.project_ids.length > 0) {
        const { listWorkspaceTaskProjectsByIds } = await import(
          '@tuturuuu/internal-api/tasks'
        );
        const workspaceProjects = await listWorkspaceTaskProjectsByIds(
          workspaceId,
          draft.project_ids
        );
        projects = workspaceProjects.map((project) => ({
          id: project.id,
          name: project.name,
          status: project.status,
        }));
      }

      // Create a fake Task pre-populated with draft data + resolved metadata
      const fakeTask: Task = {
        id: `draft-${draft.id}`,
        name: draft.name,
        description: draft.description || '',
        priority: (draft.priority as Task['priority']) || null,
        list_id: draft.list_id || '',
        start_date: draft.start_date || undefined,
        end_date: draft.end_date || undefined,
        estimation_points: draft.estimation_points ?? null,
        display_number: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted: false,
        archived: false,
        labels,
        assignees,
        projects,
      } as Task;

      queueDialogState({
        isOpen: true,
        task: fakeTask,
        boardId: draft.board_id || '',
        mode: 'create',
        collaborationMode: false,
        draftId: draft.id,
      });
    },
    [queueDialogState]
  );

  // Register an update callback (returns cleanup function)
  const onUpdate = useCallback((callback: () => void) => {
    console.log('📝 TaskDialogProvider: Registering update callback');
    updateCallbacksRef.current.add(callback);

    // Return cleanup function to remove this callback
    return () => {
      console.log('📝 TaskDialogProvider: Unregistering update callback');
      updateCallbacksRef.current.delete(callback);
    };
  }, []);

  // Register a close callback
  const onClose = useCallback((callback: () => void) => {
    console.log('📝 TaskDialogProvider: Registering close callback');
    closeCallbackRef.current = callback;
  }, []);

  // Call all registered update callbacks (used internally by TaskEditDialog)
  const triggerUpdate = useCallback(() => {
    console.log('🔔 TaskDialogProvider: Triggering update callbacks', {
      callbackCount: updateCallbacksRef.current.size,
      hasExternalCallback: !!externalOnUpdate,
    });
    // Call all registered callbacks
    updateCallbacksRef.current.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('Error in update callback:', error);
      }
    });
    externalOnUpdate?.();
  }, [externalOnUpdate]);

  // Call the registered close callback (used internally by TaskEditDialog)
  const triggerClose = useCallback(() => {
    console.log('🔔 TaskDialogProvider: Triggering close callback', {
      hasCallback: !!closeCallbackRef.current,
    });

    // Always close the dialog first for immediate UI feedback
    closeDialog();

    // Then call any registered callback (e.g., for navigation)
    // The loading state in the calling component will prevent blank screen
    if (closeCallbackRef.current) {
      closeCallbackRef.current();
    }
  }, [closeDialog]);

  const contextValue = useMemo<TaskDialogContextValue>(
    () => ({
      state,
      isPersonalWorkspace,
      openTask,
      openTaskById,
      createTask,
      createSubtask,
      createTaskWithRelationship,
      editDraft,
      closeDialog,
      onUpdate,
      onClose,
      triggerUpdate,
      triggerClose,
      registerCloseRequestHandler,
    }),
    [
      state,
      isPersonalWorkspace,
      openTask,
      openTaskById,
      createTask,
      createSubtask,
      createTaskWithRelationship,
      editDraft,
      closeDialog,
      onUpdate,
      onClose,
      triggerUpdate,
      triggerClose,
      registerCloseRequestHandler,
    ]
  );

  return (
    <TaskDialogContext.Provider value={contextValue}>
      {children}
    </TaskDialogContext.Provider>
  );
}
