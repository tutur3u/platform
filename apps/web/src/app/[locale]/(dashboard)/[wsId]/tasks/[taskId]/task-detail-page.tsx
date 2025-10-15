'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

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
  const router = useRouter();
  const hasRedirectedRef = useRef(false);

  // Handle navigation back to board view
  const navigateToBoard = useCallback(() => {
    if (hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;

    console.log('🔙 Navigating back to board view...');
    router.push(`/${wsId}/tasks/boards/${boardId}`);
    router.refresh();
  }, [router, wsId, boardId]);

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

  // Navigate back to board (user will close dialog manually)
  // The centralized dialog will handle the display
  return null;
}
