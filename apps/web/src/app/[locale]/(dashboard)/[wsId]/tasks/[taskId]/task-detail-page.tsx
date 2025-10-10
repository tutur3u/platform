'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
import { useEffect } from 'react';

interface TaskDetailPageProps {
  task: Task;
  boardId: string;
  boardName?: string;
  listName?: string;
  wsId: string;
}

export default function TaskDetailPage({ task, boardId }: TaskDetailPageProps) {
  const { openTask } = useTaskDialog();

  // Open task dialog on mount
  useEffect(() => {
    openTask(task, boardId);
  }, [task, boardId, openTask]);

  // Navigate back to board (user will close dialog manually)
  // The centralized dialog will handle the display
  return null;
}
