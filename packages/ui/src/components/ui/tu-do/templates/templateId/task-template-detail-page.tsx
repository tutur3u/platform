import TaskTemplateDetailPageClient from '@tuturuuu/ui/tu-do/templates/templateId/task-template-detail-page-client';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';

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

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  const wsId = workspace.id;

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;
  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  return (
    <TaskTemplateDetailPageClient
      wsId={wsId}
      templateId={templateId}
      templatesBasePath={templatesBasePath}
    />
  );
}
