'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTaskDialogContext } from '../providers/task-dialog-provider';
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
  const router = useRouter();
  const pathname = usePathname();
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

  // Handle URL manipulation when fakeTaskUrl is enabled
  useEffect(() => {
    if (state.isOpen && state.fakeTaskUrl && state.task?.id) {
      // Store original pathname if not already stored
      if (!originalPathnameRef.current) {
        originalPathnameRef.current = pathname;
      }

      // Use task's actual workspace ID if available, otherwise fall back to current wsId
      const effectiveWsId = state.taskWsId || wsId;
      const taskUrl = `/${effectiveWsId}/tasks/${state.task.id}`;
      // Only push if the URL is different
      if (pathname !== taskUrl) {
        router.push(taskUrl, { scroll: false });
        hasChangedUrlRef.current = true;
      }
    } else if (
      !state.isOpen &&
      hasChangedUrlRef.current &&
      originalPathnameRef.current
    ) {
      // Revert to original URL when dialog closes
      router.push(originalPathnameRef.current, { scroll: false });
      // Reset refs
      originalPathnameRef.current = null;
      hasChangedUrlRef.current = false;
    }
  }, [
    state.isOpen,
    state.fakeTaskUrl,
    state.task?.id,
    state.taskWsId,
    wsId,
    router,
    pathname,
  ]);

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

  if (!state.isOpen || !state.task) {
    return null;
  }

  return (
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
}
