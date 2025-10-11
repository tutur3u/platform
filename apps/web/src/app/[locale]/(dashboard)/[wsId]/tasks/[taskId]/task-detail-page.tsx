'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

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
  const { openTask, onUpdate } = useTaskDialog();
  const router = useRouter();

  // Register update callback to redirect to board view
  const handleUpdate = useCallback(() => {
    console.log('🔄 Task updated on detail page, redirecting to board view...');
    // Redirect to board view with a small delay to ensure DB transaction completes
    setTimeout(() => {
      router.push(`/${wsId}/tasks/boards/${boardId}`);
    }, 150);
  }, [router, wsId, boardId]);

  // Register the update callback
  useEffect(() => {
    console.log('✅ Registering task detail page update callback');
    onUpdate(handleUpdate);
  }, [onUpdate, handleUpdate]);

  // Open task dialog on mount
  useEffect(() => {
    openTask(task, boardId);
  }, [task, boardId, openTask]);

  // Navigate back to board (user will close dialog manually)
  // The centralized dialog will handle the display
  return null;
}
