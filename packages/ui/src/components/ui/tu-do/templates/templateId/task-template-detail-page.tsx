import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api';
import {
  getWorkspaceTemplate,
  getWorkspaceTemplateBackgroundUrl,
  type InternalApiWorkspaceTemplate,
} from '@tuturuuu/internal-api/templates';
import TaskTemplateDetailPageClient from '@tuturuuu/ui/tu-do/templates/templateId/task-template-detail-page-client';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { validate } from 'uuid';

interface Props {
  params: Promise<{
    wsId: string;
    templateId: string;
  }>;
  config?: {
    templatesBasePath?: string;
  };
}

/**
 * Shared Task Template Detail Page component.
 * Handles workspace resolution, permissions, and data fetching.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskTemplateDetailPage({
  params,
  config = {},
}: Props) {
  const { templatesBasePath = 'templates' } = config;
  const { wsId: id, templateId } = await params;

  if (!validate(templateId)) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  const wsId = workspace.id;

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;
  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const requestHeaders = await headers();
  const internalApiOptions = withForwardedInternalApiAuth(requestHeaders);

  let initialTemplate: InternalApiWorkspaceTemplate;
  try {
    initialTemplate = await getWorkspaceTemplate(
      wsId,
      templateId,
      internalApiOptions
    );
  } catch {
    notFound();
  }

  let initialBackgroundUrl: string | null = null;
  if (initialTemplate.backgroundPath) {
    try {
      initialBackgroundUrl = await getWorkspaceTemplateBackgroundUrl(
        wsId,
        templateId,
        internalApiOptions
      );
    } catch {
      initialBackgroundUrl = null;
    }
  }

  return (
    <TaskTemplateDetailPageClient
      wsId={wsId}
      templateId={templateId}
      templatesBasePath={templatesBasePath}
      initialTemplate={initialTemplate}
      initialBackgroundUrl={initialBackgroundUrl}
    />
  );
}
