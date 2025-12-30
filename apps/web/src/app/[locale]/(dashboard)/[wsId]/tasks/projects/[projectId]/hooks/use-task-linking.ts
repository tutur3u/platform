'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

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

  // Query for fetching available tasks (only when dialog is open)
  const { data: availableTasks = [] } = useQuery({
    queryKey: ['workspace-tasks', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/tasks`);
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      const data = await response.json();
      return (data.tasks || []) as Task[];
    },
    enabled: showLinkTaskDialog,
    staleTime: 60000, // 1 minute
  });

  // Filter available tasks based on search
  const filteredAvailableTasks = useMemo(() => {
    if (!searchQuery) return [];
    return availableTasks.filter(
      (task) =>
        task.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !linkedTasks.some((t) => t.id === task.id)
    );
  }, [availableTasks, searchQuery, linkedTasks]);

  // Mutation for linking task to project
  const linkTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
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

      return response.json();
    },
    onSuccess: () => {
      toast.success('Task linked successfully');
      router.refresh();
      setShowLinkTaskDialog(false);
      setSearchQuery('');
    },
    onError: (error) => {
      console.error('Error linking task:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to link task'
      );
    },
  });

  const linkTaskToProject = useCallback(
    (taskId: string) => {
      linkTaskMutation.mutate(taskId);
    },
    [linkTaskMutation]
  );

  return {
    showLinkTaskDialog,
    setShowLinkTaskDialog,
    searchQuery,
    setSearchQuery,
    filteredAvailableTasks,
    isLinkingTask: linkTaskMutation.isPending,
    linkTaskToProject,
  };
}
