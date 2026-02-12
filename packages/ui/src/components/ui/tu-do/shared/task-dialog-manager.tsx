'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTaskDialogContext } from '../providers/task-dialog-provider';
import {
  useOptionalWorkspacePresenceContext,
  WorkspacePresenceProvider,
} from '../providers/workspace-presence-provider';
import { TaskEditDialog } from './task-edit-dialog';

/**
 * Manager component that renders the centralized task dialog
 * This component should be placed once at the workspace layout level
 *
 * NOTE: TaskEditDialog is directly imported (not lazy-loaded) to ensure
 * instant dialog opening when clicking tasks. This is a core interaction
 * that benefits from immediate availability over bundle size optimization.
 */
export function TaskDialogManager({ wsId }: { wsId: string }) {
  const {
    state,
    isPersonalWorkspace,
    triggerClose,
    triggerUpdate,
    openTaskById,
    createSubtask,
    createTaskWithRelationship,
  } = useTaskDialogContext();

  // Store the original pathname before URL manipulation
  const originalPathnameRef = useRef<string | null>(null);
  const hasChangedUrlRef = useRef(false);

  // Handle URL manipulation when fakeTaskUrl is enabled.
  // Uses window.history.pushState (not router.push) to update the URL bar
  // without triggering Next.js navigation, which would load the task detail page
  // behind the dialog and cause a jarring double-dialog flash.
  useEffect(() => {
    if (state.isOpen && state.fakeTaskUrl && state.task?.id) {
      const currentPath = window.location.pathname;
      if (!originalPathnameRef.current) {
        originalPathnameRef.current = currentPath;
      }

      const effectiveWsId = state.taskWsId || wsId;
      // Extract locale prefix from URL (e.g. "/vi" from "/vi/ws-123/...")
      const wsSegment = `/${effectiveWsId}`;
      const wsIndex = currentPath.indexOf(wsSegment);
      const localePrefix = wsIndex > 0 ? currentPath.substring(0, wsIndex) : '';
      const taskUrl = `${localePrefix}/${effectiveWsId}/tasks/${state.task.id}`;

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
  }, [state.isOpen, state.fakeTaskUrl, state.task?.id, state.taskWsId, wsId]);

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
    display_name?: string;
    email?: string;
    avatar_url?: string;
  } | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const fetchUser = async () => {
      // Get session immediately (cached in localStorage)
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        // Set basic user info immediately
        setCurrentUser({
          id: session.user.id,
          email: session.user.email,
        });

        // Fetch full user details in background
        const { data: userData } = await supabase
          .from('users')
          .select('id, display_name, avatar_url')
          .eq('id', session.user.id)
          .single();

        if (userData) {
          setCurrentUser({
            id: userData.id,
            display_name: userData.display_name || undefined,
            email: session.user.email,
            avatar_url: userData.avatar_url || undefined,
          });
        }
      }
    };

    fetchUser();
  }, []);

  // Read draft mode preference from user config (same query key as useUserBooleanConfig)
  const { data: draftModeRaw } = useQuery({
    queryKey: ['user-config', 'TASK_DRAFT_MODE_ENABLED'],
    queryFn: async () => {
      const res = await fetch(
        '/api/v1/users/me/configs/TASK_DRAFT_MODE_ENABLED'
      );
      if (res.status === 404) return 'false';
      if (!res.ok) return 'false';
      const data = await res.json();
      return (data.value as string) ?? 'false';
    },
    staleTime: 5 * 60 * 1000,
  });
  const draftModeEnabled = draftModeRaw === 'true';

  const handleClose = () => {
    triggerClose();
  };

  // Navigate to a task by opening it in the dialog
  const handleNavigateToTask = useCallback(
    async (taskId: string) => {
      await openTaskById(taskId);
    },
    [openTaskById]
  );

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

  // Track presence location when the dialog is open in edit mode.
  // On kanban boards, BoardUserPresenceAvatarsComponent also calls updateLocation
  // with the same args — this is idempotent (same location = no-op).
  // For non-board contexts (My Tasks, dashboard), this is the only caller.
  const wsPresence = useOptionalWorkspacePresenceContext();
  const wsUpdateLocation = wsPresence?.updateLocation;

  useEffect(() => {
    if (!wsUpdateLocation || !state.isOpen || state.mode === 'create') return;
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
    state.task?.id,
    state.boardId,
  ]);

  // Determine if the task needs its own presence provider (cross-workspace tasks)
  const needsOwnProvider =
    state.realtimeEnabled &&
    state.taskWsId &&
    (!wsPresence?.realtimeEnabled || state.taskWsId !== wsId);

  if (!state.isOpen || !state.task) {
    return null;
  }

  const dialog = (
    <TaskEditDialog
      wsId={wsId}
      task={state.task}
      boardId={state.boardId || ''}
      isOpen={state.isOpen}
      availableLists={state.availableLists}
      filters={state.filters}
      mode={state.mode}
      collaborationMode={state.collaborationMode}
      realtimeEnabled={state.realtimeEnabled}
      isPersonalWorkspace={isPersonalWorkspace}
      parentTaskId={state.parentTaskId}
      parentTaskName={state.parentTaskName}
      pendingRelationship={state.pendingRelationship}
      currentUser={currentUser || undefined}
      draftModeEnabled={draftModeEnabled}
      draftId={state.draftId}
      onClose={handleClose}
      onUpdate={triggerUpdate}
      onNavigateToTask={handleNavigateToTask}
      onAddSubtask={handleAddSubtask}
      onAddParentTask={handleAddParentTask}
      onAddBlockingTask={handleAddBlockingTask}
      onAddBlockedByTask={handleAddBlockedByTask}
      onAddRelatedTask={handleAddRelatedTask}
    />
  );

  if (needsOwnProvider && state.taskWsId) {
    return (
      <WorkspacePresenceProvider
        wsId={state.taskWsId}
        tier={null}
        enabled={!state.taskWorkspacePersonal}
      >
        {dialog}
      </WorkspacePresenceProvider>
    );
  }

  return dialog;
}
