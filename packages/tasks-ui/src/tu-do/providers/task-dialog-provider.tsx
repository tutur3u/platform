'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { TaskFilters } from '@tuturuuu/tasks-ui/tu-do/boards/boardId/task-filter';
import type { WorkspaceProductTier } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
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
import type { PendingRelationshipType } from '../shared/task-edit-dialog/types/pending-relationship';
import { taskDetailQuery } from './task-detail-query';
import type {
  OpenTaskByIdOptions,
  TaskAssigneeMemberSource,
  TaskDialogContextValue,
  TaskDialogState,
} from './task-dialog-types';
import { useOptionalWorkspacePresenceContext } from './workspace-presence-provider';

export type { TaskAssigneeMemberSource } from './task-dialog-types';
export type {
  PendingRelationship,
  PendingRelationshipType,
} from '../shared/task-edit-dialog/types/pending-relationship';

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
  const queryClient = useQueryClient();
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
      const isSameTaskAlreadyOpen =
        currentState.isOpen && currentState.task?.id === taskId;

      if (isSameTaskAlreadyOpen) {
        // Re-opening the task that is already on screen must never go through
        // the queue: that closes the dialog and opens a second one, so the user
        // watches a skeleton appear, vanish, and appear again before the content
        // lands. Refresh in place instead — this covers a retry after a load
        // error and any duplicate open (a re-fired effect, a double click, a
        // notification for the task already open).
        setState(
          currentState.taskLoadError
            ? // The visible dialog is an error state, so there is nothing worth
              // keeping: fall back to the loading skeleton.
              initialDialogState
            : // Otherwise keep what is on screen and let the fresh data swap in
              // when it arrives, so a duplicate open is invisible.
              {
                ...currentState,
                taskLoadError: false,
                taskOpenRequestId: requestId,
              }
        );
      } else {
        queueDialogState(initialDialogState);
      }

      try {
        const response = await queryClient.fetchQuery(
          taskDetailQuery(taskId, options?.taskWsId)
        );

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
      queryClient,
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
      const { resolveTaskProjectWorkspaceId } =
        await import('@tuturuuu/internal-api/tasks');
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
        const { listWorkspaceLabels } =
          await import('@tuturuuu/internal-api/tasks');
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
        const { listWorkspaceMembers } =
          await import('@tuturuuu/internal-api/workspaces');
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
        const { listWorkspaceTaskProjectsByIds } =
          await import('@tuturuuu/internal-api/tasks');
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
    const taskId = stateRef.current.task?.id;
    if (taskId && stateRef.current.mode === 'edit') {
      void queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
    }
    // Call all registered callbacks
    updateCallbacksRef.current.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('Error in update callback:', error);
      }
    });
    externalOnUpdate?.();
  }, [externalOnUpdate, queryClient]);

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
