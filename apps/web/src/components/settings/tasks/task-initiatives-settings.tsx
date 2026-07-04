'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { listWorkspaceTaskInitiatives } from '@tuturuuu/internal-api/tasks';
import { TaskInitiativesClient } from '@tuturuuu/ui/tu-do/initiatives/task-initiatives-client';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

export function TaskInitiativesSettings({ wsId }: { wsId: string }) {
  const { data: initiatives = [], isLoading } = useQuery({
    queryKey: ['task-initiatives-settings', wsId],
    queryFn: () =>
      listWorkspaceTaskInitiatives(wsId, getBrowserInternalApiOptions()),
    enabled: !!wsId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <TaskInitiativesClient initialInitiatives={initiatives} wsId={wsId} />;
}
