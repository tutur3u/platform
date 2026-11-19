import type { Task } from '@tuturuuu/types/primitives/Task';
import { getTaskDisplayTicketLabel } from '@tuturuuu/utils/task-helper';
import { useEffect } from 'react';

export function useTaskDocumentTitle(task: Task | null) {
  useEffect(() => {
    if (!task) return;
    const originalTitle = document.title;
    document.title = [getTaskDisplayTicketLabel(task), task.name]
      .filter(Boolean)
      .join(' - ');
    return () => {
      document.title = originalTitle;
    };
  }, [task]);
}
