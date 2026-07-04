'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { listWorkspaceLabels } from '@tuturuuu/internal-api/tasks';
import TaskLabelsClient from '@tuturuuu/ui/tu-do/labels/client';
import type { TaskLabel } from '@tuturuuu/ui/tu-do/labels/types';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

export function TaskLabelsSettings({ wsId }: { wsId: string }) {
  const { data: labels = [], isLoading } = useQuery({
    queryKey: ['task-labels-settings', wsId],
    queryFn: () => listWorkspaceLabels(wsId, getBrowserInternalApiOptions()),
    enabled: !!wsId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <TaskLabelsClient initialLabels={labels as TaskLabel[]} wsId={wsId} />;
}
