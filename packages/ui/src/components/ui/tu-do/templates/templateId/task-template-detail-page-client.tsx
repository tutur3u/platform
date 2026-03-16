'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  getWorkspaceTemplate,
  getWorkspaceTemplateBackgroundUrl,
  type InternalApiWorkspaceTemplate,
} from '@tuturuuu/internal-api/templates';
import TemplateDetailClient from '@tuturuuu/ui/tu-do/templates/templateId/client';
import type { BoardTemplateWithContent } from '@tuturuuu/ui/tu-do/templates/types';

interface Props {
  wsId: string;
  templateId: string;
  templatesBasePath: string;
  initialTemplate: InternalApiWorkspaceTemplate;
  initialBackgroundUrl: string | null;
}

function mapTemplateToDetail(
  template: Awaited<ReturnType<typeof getWorkspaceTemplate>>,
  backgroundUrl: string | null
): BoardTemplateWithContent {
  const content = template.content ?? {};

  return {
    id: template.id,
    wsId: template.wsId,
    createdBy: template.createdBy,
    sourceBoardId: template.sourceBoardId,
    name: template.name,
    description: template.description,
    visibility: template.visibility,
    backgroundPath: template.backgroundPath ?? null,
    backgroundUrl,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    isOwner: template.isOwner,
    stats: {
      lists: template.stats?.lists ?? content.lists?.length ?? 0,
      tasks:
        template.stats?.tasks ??
        content.lists?.reduce(
          (acc, list) => acc + (list.tasks?.length ?? 0),
          0
        ) ??
        0,
      labels: template.stats?.labels ?? content.labels?.length ?? 0,
    },
    content: {
      lists: (content.lists ?? []).map((list) => ({
        name: list.name ?? '',
        status: list.status ?? 'active',
        color: null,
        position: null,
        archived: false,
        tasks: (list.tasks ?? []).map((task) => ({
          name: task.name,
          description: task.description ?? null,
          priority: task.priority ?? null,
          completed: task.completed,
          start_date: task.start_date ?? null,
          end_date: task.end_date ?? null,
        })),
      })),
      labels: content.labels ?? [],
      settings: content.settings ?? {},
    },
  };
}

export default function TaskTemplateDetailPageClient({
  wsId,
  templateId,
  templatesBasePath,
  initialTemplate,
  initialBackgroundUrl,
}: Props) {
  const { data: template, error } = useQuery({
    queryKey: ['workspace-template', wsId, templateId],
    queryFn: () => getWorkspaceTemplate(wsId, templateId),
    enabled: !!wsId && !!templateId,
    initialData: initialTemplate,
  });

  const { data: backgroundUrl } = useQuery({
    queryKey: [
      'workspace-template-background',
      wsId,
      templateId,
      template?.backgroundPath ?? null,
    ],
    queryFn: () => getWorkspaceTemplateBackgroundUrl(wsId, templateId),
    enabled: !!wsId && !!templateId && !!template?.backgroundPath,
    staleTime: 30 * 60 * 1000,
    initialData: initialBackgroundUrl,
  });

  if (error) {
    throw error;
  }

  if (!template) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <TemplateDetailClient
        wsId={wsId}
        template={mapTemplateToDetail(template, backgroundUrl ?? null)}
        templatesBasePath={templatesBasePath}
      />
    </div>
  );
}
