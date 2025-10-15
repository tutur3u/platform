'use client';

import { Loader2 } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
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
  const hasRedirectedRef = useRef(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Handle navigation back to board view
  const navigateToBoard = useCallback(() => {
    if (hasRedirectedRef.current) {
      console.log('⚠️ Navigation already triggered, skipping...');
      return;
    }

    console.log('🔙 Starting navigation with full page refresh...', {
      from: 'task detail page',
      to: `/${wsId}/tasks/boards/${boardId}`,
    });

    hasRedirectedRef.current = true;
    setIsNavigating(true);

    const targetUrl = `/${wsId}/tasks/boards/${boardId}`;
    console.log('🔀 Full page refresh to:', targetUrl);

    // Do a full page refresh to ensure everything is properly cleaned up
    window.location.href = targetUrl;
  }, [wsId, boardId]);

  // Register update callback to redirect after task update
  const handleUpdate = useCallback(() => {
    console.log('🔄 Task updated on detail page');
    navigateToBoard();
  }, [navigateToBoard]);

  // Handle dialog close (user clicked X or pressed Escape)
  const handleClose = useCallback(() => {
    console.log('❌ Dialog closed on detail page');
    navigateToBoard();
  }, [navigateToBoard]);

  // Register the update and close callbacks
  useEffect(() => {
    console.log('✅ Registering task detail page callbacks');
    onUpdate(handleUpdate);
    onClose(handleClose);
  }, [onUpdate, onClose, handleUpdate, handleClose]);

  // Open task dialog on mount
  useEffect(() => {
    openTask(task, boardId);
  }, [task, boardId, openTask]);

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
