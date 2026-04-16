'use client';

import {
  listWorkspaceLabels,
  listWorkspaceMembers,
} from '@tuturuuu/internal-api';
import {
  getCurrentUserTask,
  listWorkspaceTaskProjectsByIds,
  resolveTaskProjectWorkspaceId,
} from '@tuturuuu/internal-api/tasks';
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
import type {
  PendingRelationship,
  PendingRelationshipType,
} from '../shared/task-edit-dialog/types/pending-relationship';
import { useOptionalWorkspacePresenceContext } from './workspace-presence-provider';

export type { PendingRelationship, PendingRelationshipType };

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
  /** The task workspace tier used to gate cursor tracking for edit mode */
  taskWorkspaceTier?: WorkspaceProductTier;
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
      /** The task's workspace tier (affects cursor tracking) */
      taskWorkspaceTier?: WorkspaceProductTier;
    }
  ) => void;

  // Open task by ID (fetches task data first)
  openTaskById: (taskId: string) => Promise<boolean>;

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
    handler: (() => void | Promise<void>) | null
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
  const isDialogOpenRef = useRef(state.isOpen);
  const queuedDialogStatesRef = useRef<TaskDialogState[]>([]);
  const queuedOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRequestHandlerRef = useRef<(() => void | Promise<void>) | null>(
    null
  );
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
    (handler: (() => void | Promise<void>) | null) => {
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
        void Promise.resolve(requestClose()).catch((error) => {
          console.error('Failed to request task dialog close:', error);
        });
        return;
      }

      closeDialog();
    },
    [closeDialog]
  );

  useEffect(() => {
    isDialogOpenRef.current = state.isOpen;

    if (state.isOpen) {
      return;
    }

    closeRequestInFlightRef.current = false;
    flushQueuedDialogState();
  }, [flushQueuedDialogState, state.isOpen]);

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
        taskWorkspaceTier: options?.taskWorkspaceTier,
      });
    },
    [canUseTaskCursors, isPersonalWorkspace, queueDialogState]
  );

  const openTaskById = useCallback(
    async (taskId: string) => {
      try {
        let response:
          | {
              task: Task & {
                list?: {
                  board_id?: string | null;
                } | null;
              };
              availableLists: TaskList[];
              taskWsId: string;
              taskWorkspacePersonal: boolean;
              taskWorkspaceTier: WorkspaceProductTier;
            }
          | undefined;

        try {
          response = await getCurrentUserTask(taskId, {
            fetch: (input, init) =>
              fetch(new URL(String(input), window.location.origin).toString(), {
                ...init,
                cache: 'no-store',
              }),
          });
        } catch {
          return false;
        }

        if (!response) {
          return false;
        }

        const transformedTask = response.task;
        const taskWsId = response.taskWsId;
        const taskWorkspacePersonal = response.taskWorkspacePersonal;
        const taskWorkspaceTier = response.taskWorkspaceTier;
        const isTaskWorkspacePersonal =
          taskWorkspacePersonal ?? isPersonalWorkspace;

        // Realtime sync (auto-save via Yjs) is always enabled in edit mode.
        // Cursor presence requires tier check and non-personal workspace.
        const shouldEnableCursors = canUseTaskCursors(
          isTaskWorkspacePersonal,
          taskWorkspaceTier
        );

        // Open the task in edit mode
        queueDialogState({
          isOpen: true,
          task: transformedTask as Task,
          boardId: transformedTask.list?.board_id ?? undefined,
          mode: 'edit',
          availableLists: response.availableLists || undefined,
          collaborationMode: shouldEnableCursors,
          realtimeEnabled: true,
          taskWsId,
          taskWorkspacePersonal: isTaskWorkspacePersonal,
          taskWorkspaceTier,
        });
        return true;
      } catch (error) {
        console.error('Failed to open task:', error);
        return false;
      }
    },
    [canUseTaskCursors, isPersonalWorkspace, queueDialogState]
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
        const data = await listWorkspaceLabels(workspaceId);
        labels = data
          .filter((label: (typeof data)[number]) =>
            draft.label_ids?.includes(label.id)
          )
          .map((l: (typeof data)[number]) => ({
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
        const data = await listWorkspaceMembers(workspaceId);
        assignees = data
          .filter((user: (typeof data)[number]) =>
            Boolean(user.user_id && draft.assignee_ids?.includes(user.user_id))
          )
          .map((u: (typeof data)[number]) => ({
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
