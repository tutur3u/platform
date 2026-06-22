'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { listWorkspaceTaskProjectDetails } from '@tuturuuu/internal-api/tasks';
import { TaskProjectsClient } from '@tuturuuu/ui/tu-do/projects/task-projects-client';
import type { TaskProject } from '@tuturuuu/ui/tu-do/projects/types';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

export function TaskProjectsSettings({ wsId }: { wsId: string }) {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['task-projects-settings', wsId],
    queryFn: () =>
      listWorkspaceTaskProjectDetails(wsId, getBrowserInternalApiOptions()),
    enabled: !!wsId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TaskProjectsClient
      initialProjects={projects as TaskProject[]}
      wsId={wsId}
    />
  );
}
