'use client';

import { Loader2 } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
import { useTaskDialogContext } from '@tuturuuu/ui/tu-do/providers/task-dialog-provider';
import { useOptionalWorkspacePresenceContext } from '@tuturuuu/ui/tu-do/providers/workspace-presence-provider';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

interface TaskDetailPageProps {
  task: Task;
  boardId: string;
  boardName?: string;
  listName?: string;
  wsId: string;
}

export default function TaskDetailPage({
  task,
  boardId,
  wsId,
}: TaskDetailPageProps) {
  const { openTask, onUpdate, onClose } = useTaskDialog();
  const { state: dialogState } = useTaskDialogContext();
  const wsPresence = useOptionalWorkspacePresenceContext();
  const router = useRouter();
  const hasRedirectedRef = useRef(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const wasOpenOnMount = useRef(dialogState.isOpen);

  // Handle navigation back to board view
  const navigateToBoard = useCallback(() => {
    if (hasRedirectedRef.current) {
      console.log('⚠️ Navigation already triggered, skipping...');
      return;
    }

    hasRedirectedRef.current = true;
    setIsNavigating(true);

    if (window.history.length > 1) {
      router.back();
    } else {
      const targetUrl = `/${wsId}/tasks/boards/${boardId}`;
      router.push(targetUrl);
    }
  }, [wsId, boardId, router]);

  // Task was saved — stay on the dedicated task URL (don't navigate away)
  const handleUpdate = useCallback(() => {
    console.log('🔄 Task updated on detail page');
  }, []);

  // Handle dialog close (user clicked X or pressed Escape)
  const handleClose = useCallback(() => {
    console.log('❌ Dialog closed on detail page');
    navigateToBoard();
  }, [navigateToBoard]);

  // Register the update and close callbacks
  useEffect(() => {
    if (wasOpenOnMount.current) return;

    console.log('✅ Registering task detail page callbacks');
    const unsubUpdate = onUpdate(handleUpdate);
    onClose(handleClose);

    return () => {
      unsubUpdate();
    };
  }, [onUpdate, onClose, handleUpdate, handleClose]);

  // Open task dialog on mount
  useEffect(() => {
    if (wasOpenOnMount.current) return;

    openTask(task, boardId);
  }, [task, boardId, openTask]);

  // Track presence for avatar display — on the kanban board page,
  // BoardUserPresenceAvatarsComponent handles this, but on the dedicated
  // task detail page we need to call updateLocation ourselves so the
  // lazy presence channel is initialized and other users can see us.
  const wsUpdateLocation = wsPresence?.updateLocation;
  useEffect(() => {
    if (!wsUpdateLocation || !task.id || !boardId) return;
    wsUpdateLocation({ type: 'board', boardId, taskId: task.id });

    return () => {
      // Clear task-level presence when leaving the page
      wsUpdateLocation({ type: 'other' });
    };
  }, [wsUpdateLocation, boardId, task.id]);

  // Show loading state during navigation to prevent blank screen
  if (isNavigating) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Redirecting...</p>
        </div>
      </div>
    );
  }

  // The centralized dialog will handle the display
  return null;
}
