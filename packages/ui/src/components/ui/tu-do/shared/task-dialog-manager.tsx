'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentUserProfile } from '@tuturuuu/internal-api';
import { getWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import { getUserConfig } from '@tuturuuu/internal-api/users';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTaskDialogContext } from '../providers/task-dialog-provider';
import {
  useOptionalWorkspacePresenceContext,
  WorkspacePresenceProvider,
} from '../providers/workspace-presence-provider';
import { dispatchRecentSidebarVisit } from './recent-sidebar-events';
import {
  normalizeTaskDialogPresentation,
  TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID,
} from './task-dialog-presentation';
import { TaskEditDialog } from './task-edit-dialog';
import {
  dispatchTaskOpenResult,
  REQUEST_OPEN_TASK_EVENT,
  type RequestOpenTaskPayload,
} from './task-open-events';
import { buildWorkspaceTaskUrl } from './task-url';

/**
 * Manager component that renders the centralized task dialog
 * This component should be placed once at the workspace layout level
 *
 * NOTE: TaskEditDialog is directly imported (not lazy-loaded) to ensure
 * instant dialog opening when clicking tasks. This is a core interaction
 * that benefits from immediate availability over bundle size optimization.
 */
export function TaskDialogManager({ wsId }: { wsId: string }) {
  const searchParams = useSearchParams();
  const {
    state,
    isPersonalWorkspace,
    triggerClose,
    triggerUpdate,
    openTask,
    openTaskById,
    createSubtask,
    createTaskWithRelationship,
  } = useTaskDialogContext();
  const queryClient = useQueryClient();

  // Store the original pathname before URL manipulation
  const originalPathnameRef = useRef<string | null>(null);
  const hasChangedUrlRef = useRef(false);
  const handledCanonicalTaskQueryRef = useRef<string | null>(null);

  // Handle URL manipulation when fakeTaskUrl is enabled.
  // Uses window.history.pushState (not router.push) to update the URL bar
  // without triggering Next.js navigation, which would load the task detail page
  // behind the dialog and cause a jarring double-dialog flash.
  useEffect(() => {
    if (state.isOpen && state.fakeTaskUrl && state.task?.id && state.boardId) {
      const currentPath = `${window.location.pathname}${window.location.search}`;
      if (!originalPathnameRef.current) {
        originalPathnameRef.current = currentPath;
      }

      const effectiveWsId = state.taskWsId || wsId;
      const taskUrl = buildWorkspaceTaskUrl({
        boardId: state.boardId,
        currentPathname: window.location.pathname,
        taskId: state.task.id,
        workspaceId: effectiveWsId,
        isPersonalWorkspace: state.taskWorkspacePersonal ?? isPersonalWorkspace,
      });

      if (currentPath !== taskUrl) {
        window.history.pushState(
          {
            __fakeTaskUrl: true,
            originalPathname: originalPathnameRef.current,
          },
          '',
          taskUrl
        );
        hasChangedUrlRef.current = true;
      }
    } else if (
      !state.isOpen &&
      hasChangedUrlRef.current &&
      originalPathnameRef.current
    ) {
      // replaceState so browser back goes to real previous page, not the fake URL
      window.history.replaceState(null, '', originalPathnameRef.current);
      originalPathnameRef.current = null;
      hasChangedUrlRef.current = false;
    }
  }, [
    state.isOpen,
    state.fakeTaskUrl,
    state.task?.id,
    state.boardId,
    state.taskWsId,
    state.taskWorkspacePersonal,
    isPersonalWorkspace,
    wsId,
  ]);

  // Handle browser back button when a fake task URL is active
  useEffect(() => {
    if (!state.isOpen || !state.fakeTaskUrl) return;

    const handlePopState = () => {
      if (hasChangedUrlRef.current) {
        // Browser already reverted URL — just reset refs and close dialog
        hasChangedUrlRef.current = false;
        originalPathnameRef.current = null;
        triggerClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [state.isOpen, state.fakeTaskUrl, triggerClose]);

  // Fetch current user immediately on mount (persists across dialog open/close)
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    display_name?: string | null;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const profile = await getCurrentUserProfile().catch(() => null);

      if (profile?.id) {
        setCurrentUser({
          id: profile.id,
          display_name: profile.display_name,
          full_name: profile.full_name,
          email: profile.email,
          avatar_url: profile.avatar_url,
        });
      }
    };

    fetchUser();
  }, []);

  // Read draft mode preference from user config (same query key as useUserBooleanConfig)
  const { data: draftModeRaw } = useQuery({
    queryKey: ['user-config', 'TASK_DRAFT_MODE_ENABLED'],
    queryFn: async () =>
      (await getUserConfig('TASK_DRAFT_MODE_ENABLED')).value ?? 'false',
    staleTime: 5 * 60 * 1000,
  });
  const draftModeEnabled = draftModeRaw === 'true';

  const { data: defaultPresentationRaw } = useQuery({
    queryKey: ['user-config', TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID],
    queryFn: async () =>
      (await getUserConfig(TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID)).value ??
      'compact',
    staleTime: 5 * 60 * 1000,
  });
  const defaultPresentation = normalizeTaskDialogPresentation(
    defaultPresentationRaw
  );

  const handleClose = () => {
    triggerClose();
  };

  // Navigate to a task by opening it in the dialog
  const handleNavigateToTask = useCallback(
    async (taskId: string) => {
      if (taskId === state.task?.id) {
        return;
      }

      if (state.boardId) {
        const cachedTasks =
          queryClient.getQueryData<Task[]>(['tasks', state.boardId]) ?? [];
        const cachedTask = cachedTasks.find((task) => task.id === taskId);

        if (cachedTask) {
          openTask(cachedTask, state.boardId, state.availableLists, false, {
            taskWsId: state.taskWsId,
            taskWorkspacePersonal: state.taskWorkspacePersonal,
            taskWorkspaceTier: state.taskWorkspaceTier,
            canUseBoardAssignees: state.canUseBoardAssignees,
            assigneeMemberSource: state.assigneeMemberSource,
          });
          return;
        }
      }

      const currentTaskWsId = state.taskWsId ?? wsId;

      try {
        const { task } = await getWorkspaceTask(currentTaskWsId, taskId, {
          fetch: (input, init) =>
            fetch(new URL(String(input), window.location.origin).toString(), {
              ...init,
              cache: 'no-store',
            }),
        });

        if (task.board_id && task.board_id === state.boardId) {
          openTask(task as Task, task.board_id, state.availableLists, false, {
            taskWsId: currentTaskWsId,
            taskWorkspacePersonal: state.taskWorkspacePersonal,
            taskWorkspaceTier: state.taskWorkspaceTier,
            canUseBoardAssignees: state.canUseBoardAssignees,
            assigneeMemberSource: state.assigneeMemberSource,
          });
          return;
        }
      } catch {
        // Fall back to the generic current-user task lookup below.
      }

      await openTaskById(taskId);
    },
    [
      openTask,
      openTaskById,
      queryClient,
      state.assigneeMemberSource,
      state.availableLists,
      state.boardId,
      state.canUseBoardAssignees,
      state.task?.id,
      state.taskWorkspacePersonal,
      state.taskWorkspaceTier,
      state.taskWsId,
      wsId,
    ]
  );

  const openTaskFromCurrentWorkspace = useCallback(
    async (taskId: string) => {
      return openTaskById(taskId, {
        taskWsId: wsId,
        taskWorkspacePersonal: isPersonalWorkspace,
        canUseBoardAssignees: state.canUseBoardAssignees,
        assigneeMemberSource: state.assigneeMemberSource,
      });
    },
    [
      isPersonalWorkspace,
      openTaskById,
      state.assigneeMemberSource,
      state.canUseBoardAssignees,
      wsId,
    ]
  );

  useEffect(() => {
    const handleTaskOpenRequest = (event: Event) => {
      const customEvent = event as CustomEvent<RequestOpenTaskPayload>;
      if (customEvent.detail) {
        customEvent.detail.handled = true;
      }
      const taskId = customEvent.detail?.taskId;
      if (!taskId) return;
      const requestedWsId = customEvent.detail?.wsId;
      const requestId = customEvent.detail?.requestId;

      const emitOpenResult = (opened: boolean) => {
        if (!requestId) return;
        dispatchTaskOpenResult({ requestId, opened });
      };

      void (async () => {
        const opened = await openTaskById(taskId, {
          taskWsId: requestedWsId,
          taskWorkspacePersonal: requestedWsId
            ? undefined
            : isPersonalWorkspace,
        });
        emitOpenResult(opened);
      })();
    };

    window.addEventListener(
      REQUEST_OPEN_TASK_EVENT,
      handleTaskOpenRequest as EventListener
    );

    return () => {
      window.removeEventListener(
        REQUEST_OPEN_TASK_EVENT,
        handleTaskOpenRequest as EventListener
      );
    };
  }, [isPersonalWorkspace, openTaskById]);

  useEffect(() => {
    const canonicalTaskId = searchParams.get('task');

    if (!canonicalTaskId) {
      handledCanonicalTaskQueryRef.current = null;
      return;
    }

    if (handledCanonicalTaskQueryRef.current === canonicalTaskId) {
      return;
    }

    handledCanonicalTaskQueryRef.current = canonicalTaskId;
    void (async () => {
      const opened = await openTaskFromCurrentWorkspace(canonicalTaskId);
      if (!opened) {
        await openTaskById(canonicalTaskId);
      }
    })();
  }, [openTaskById, openTaskFromCurrentWorkspace, searchParams]);

  useEffect(() => {
    const legacyTaskId = searchParams.get('openTaskId');

    if (!legacyTaskId) {
      return;
    }

    void openTaskById(legacyTaskId, {
      taskWsId: wsId,
      taskWorkspacePersonal: isPersonalWorkspace,
    });
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete('openTaskId');

    const nextQueryString = nextSearchParams.toString();
    const nextUrl = nextQueryString
      ? `${window.location.pathname}?${nextQueryString}`
      : window.location.pathname;

    window.history.replaceState(window.history.state, '', nextUrl);
  }, [isPersonalWorkspace, openTaskById, searchParams, wsId]);

  // Open subtask creation dialog for the current task
  const handleAddSubtask = useCallback(() => {
    if (!state.task?.id || !state.boardId || !state.task?.list_id) return;

    // Use createSubtask to open the dialog in create mode with parent relationship
    createSubtask(
      state.task.id,
      state.task.name,
      state.boardId,
      state.task.list_id,
      state.availableLists
    );
  }, [
    state.task?.id,
    state.task?.list_id,
    state.task?.name,
    state.boardId,
    state.availableLists,
    createSubtask,
  ]);

  // Parameterized handler factory for relationship creation
  const handleAddRelationship = useCallback(
    (relationshipType: 'parent' | 'blocking' | 'blocked-by' | 'related') => {
      if (!state.task?.id || !state.boardId || !state.task?.list_id) return;

      createTaskWithRelationship(
        relationshipType,
        state.task.id,
        state.task.name,
        state.boardId,
        state.task.list_id,
        state.availableLists
      );
    },
    [
      state.task?.id,
      state.task?.list_id,
      state.task?.name,
      state.boardId,
      state.availableLists,
      createTaskWithRelationship,
    ]
  );

  // Bound handlers for each relationship type
  const handleAddParentTask = () => handleAddRelationship('parent');
  const handleAddBlockingTask = () => handleAddRelationship('blocking');
  const handleAddBlockedByTask = () => handleAddRelationship('blocked-by');
  const handleAddRelatedTask = () => handleAddRelationship('related');

  const handleRetryTaskLoad = useCallback(() => {
    if (!state.task?.id) return;

    void openTaskById(state.task.id, {
      initialTask: state.task,
      boardId: state.boardId,
      availableLists: state.availableLists,
      fakeTaskUrl: state.fakeTaskUrl,
      taskWsId: state.taskWsId,
      taskWorkspacePersonal: state.taskWorkspacePersonal,
      taskWorkspaceTier: state.taskWorkspaceTier,
      canUseBoardAssignees: state.canUseBoardAssignees,
      assigneeMemberSource: state.assigneeMemberSource,
      initialSharedContext: state.initialSharedContext,
    });
  }, [
    openTaskById,
    state.assigneeMemberSource,
    state.canUseBoardAssignees,
    state.initialSharedContext,
    state.availableLists,
    state.boardId,
    state.fakeTaskUrl,
    state.task,
    state.taskWorkspacePersonal,
    state.taskWorkspaceTier,
    state.taskWsId,
  ]);

  // Track presence location when the dialog is open in edit mode.
  // On kanban boards, BoardUserPresenceAvatarsComponent also calls updateLocation
  // with the same args — this is idempotent (same location = no-op).
  // For non-board contexts (My Tasks, dashboard), this is the only caller.
  const wsPresence = useOptionalWorkspacePresenceContext();
  const wsUpdateLocation = wsPresence?.updateLocation;

  useEffect(() => {
    if (
      !wsUpdateLocation ||
      !state.isOpen ||
      state.mode === 'create' ||
      state.isHydratingTask ||
      state.taskLoadError
    )
      return;
    const taskId = state.task?.id;
    const boardId = state.boardId;
    if (!taskId || !boardId) return;

    wsUpdateLocation({ type: 'board', boardId, taskId });

    return () => {
      wsUpdateLocation({ type: 'other' });
    };
  }, [
    wsUpdateLocation,
    state.isOpen,
    state.mode,
    state.isHydratingTask,
    state.taskLoadError,
    state.task?.id,
    state.boardId,
  ]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !state.isOpen ||
      state.mode === 'create' ||
      state.isHydratingTask ||
      state.taskLoadError
    ) {
      return;
    }

    const taskId = state.task?.id;
    const boardId = state.boardId;
    if (!taskId || !boardId) return;

    const taskWithLocation = state.task as
      | (Task & {
          list?: {
            board?: {
              name?: string | null;
            } | null;
            name?: string | null;
          };
        })
      | undefined;

    const targetWsId = state.taskWsId || wsId;
    const href = buildWorkspaceTaskUrl({
      boardId,
      currentPathname: window.location.pathname,
      taskId,
      workspaceId: targetWsId,
      isPersonalWorkspace: state.taskWorkspacePersonal ?? isPersonalWorkspace,
    });
    const taskName = taskWithLocation?.name || '';
    const boardName = taskWithLocation?.list?.board?.name || '';
    const listName = taskWithLocation?.list?.name || '';
    const badges = [];

    if (boardName) {
      badges.push({ kind: 'board' as const, value: boardName });
    }
    if (listName) {
      badges.push({ kind: 'list' as const, value: listName });
    }

    dispatchRecentSidebarVisit({
      href,
      scopeWsId: wsId,
      snapshot: {
        badges,
        iconKey: 'task',
        title: taskName,
      },
    });
  }, [
    state.boardId,
    state.isOpen,
    state.isHydratingTask,
    state.mode,
    state.task,
    state.taskWsId,
    state.taskWorkspacePersonal,
    state.taskLoadError,
    isPersonalWorkspace,
    wsId,
  ]);

  // Determine if the task needs its own presence provider (cross-workspace tasks).
  // Keep the provider shell mounted from the initial snapshot when taskWsId is
  // already known, otherwise hydration can wrap the open dialog in a new
  // provider and Radix replays the compact dialog entrance animation.
  const needsOwnProvider =
    state.taskWsId && (!wsPresence?.realtimeEnabled || state.taskWsId !== wsId);
  const ownProviderEnabled =
    !!state.realtimeEnabled && !state.taskWorkspacePersonal;

  if (!state.isOpen || !state.task) {
    return null;
  }

  const dialog = (
    <TaskEditDialog
      wsId={wsId}
      taskWsId={state.taskWsId}
      task={state.task}
      boardId={state.boardId || ''}
      isOpen={state.isOpen}
      availableLists={state.availableLists}
      sharedContext={
        state.isHydratingTask || state.taskLoadError
          ? state.initialSharedContext
          : undefined
      }
      filters={state.filters}
      mode={state.mode}
      collaborationMode={state.collaborationMode}
      realtimeEnabled={state.realtimeEnabled}
      isHydratingTask={state.isHydratingTask}
      taskLoadError={state.taskLoadError}
      taskHydrationVersion={state.taskHydrationVersion}
      isPersonalWorkspace={isPersonalWorkspace}
      canUseBoardAssignees={state.canUseBoardAssignees}
      assigneeMemberSource={state.assigneeMemberSource}
      parentTaskId={state.parentTaskId}
      parentTaskName={state.parentTaskName}
      pendingRelationship={state.pendingRelationship}
      currentUser={currentUser || undefined}
      draftModeEnabled={draftModeEnabled}
      defaultPresentation={defaultPresentation}
      draftId={state.draftId}
      onClose={handleClose}
      onUpdate={triggerUpdate}
      onNavigateToTask={handleNavigateToTask}
      onAddSubtask={handleAddSubtask}
      onAddParentTask={handleAddParentTask}
      onAddBlockingTask={handleAddBlockingTask}
      onAddBlockedByTask={handleAddBlockedByTask}
      onAddRelatedTask={handleAddRelatedTask}
      onRetryTaskLoad={handleRetryTaskLoad}
    />
  );

  if (needsOwnProvider && state.taskWsId) {
    return (
      <WorkspacePresenceProvider
        wsId={state.taskWsId}
        tier={state.taskWorkspaceTier ?? null}
        enabled={ownProviderEnabled}
      >
        {dialog}
      </WorkspacePresenceProvider>
    );
  }

  return dialog;
}
