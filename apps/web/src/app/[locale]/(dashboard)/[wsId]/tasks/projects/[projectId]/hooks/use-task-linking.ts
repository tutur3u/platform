'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface UseTaskLinkingOptions {
  wsId: string;
  projectId: string;
  linkedTasks: Task[];
}

export function useTaskLinking({
  wsId,
  projectId,
  linkedTasks,
}: UseTaskLinkingOptions) {
  const router = useRouter();
  const [showLinkTaskDialog, setShowLinkTaskDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [isLinkingTask, setIsLinkingTask] = useState(false);

  // Filter available tasks based on search
  const filteredAvailableTasks = useMemo(() => {
    if (!searchQuery) return [];
    return availableTasks.filter(
      (task) =>
        task.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !linkedTasks.some((t) => t.id === task.id)
    );
  }, [availableTasks, searchQuery, linkedTasks]);

  // Fetch all workspace tasks for linking
  const fetchAvailableTasks = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/workspaces/${wsId}/tasks`);
      if (response.ok) {
        const data = await response.json();
        setAvailableTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Error fetching available tasks:', error);
    }
  }, [wsId]);

  // Link task to project
  const linkTaskToProject = useCallback(
    async (taskId: string) => {
      setIsLinkingTask(true);
      try {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/task-projects/${projectId}/tasks`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to link task');
        }

        toast.success('Task linked successfully');
        router.refresh();
        setShowLinkTaskDialog(false);
        setSearchQuery('');
      } catch (error) {
        console.error('Error linking task:', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to link task'
        );
      } finally {
        setIsLinkingTask(false);
      }
    },
    [wsId, projectId, router]
  );

  // Fetch available tasks when dialog opens
  useEffect(() => {
    if (showLinkTaskDialog) {
      fetchAvailableTasks();
    }
  }, [showLinkTaskDialog, fetchAvailableTasks]);

  return {
    showLinkTaskDialog,
    setShowLinkTaskDialog,
    searchQuery,
    setSearchQuery,
    filteredAvailableTasks,
    isLinkingTask,
    linkTaskToProject,
  };
}
