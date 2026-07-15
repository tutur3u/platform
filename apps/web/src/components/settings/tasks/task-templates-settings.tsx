'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { listWorkspaceTemplates } from '@tuturuuu/internal-api';
import TemplatesClient from '@tuturuuu/tasks-ui/tu-do/templates/client';
import type { BoardTemplate } from '@tuturuuu/tasks-ui/tu-do/templates/types';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

export function TaskTemplatesSettings({ wsId }: { wsId: string }) {
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['task-templates-settings', wsId],
    queryFn: () => listWorkspaceTemplates(wsId, getBrowserInternalApiOptions()),
    enabled: !!wsId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const boardTemplates: BoardTemplate[] = templates.map((template) => ({
    id: template.id,
    wsId: template.wsId,
    createdBy: template.createdBy,
    sourceBoardId: template.sourceBoardId,
    name: template.name,
    description: template.description,
    visibility: template.visibility,
    backgroundUrl: template.backgroundUrl ?? null,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    isOwner: template.isOwner,
    stats: template.stats,
  }));

  return (
    <TemplatesClient
      initialTemplates={boardTemplates}
      templatesBasePath="tasks/templates"
      wsId={wsId}
    />
  );
}
