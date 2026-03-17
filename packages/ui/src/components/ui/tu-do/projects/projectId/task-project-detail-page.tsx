import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api';
import {
  getWorkspaceTaskProject,
  getWorkspaceTaskProjectTasks,
} from '@tuturuuu/internal-api/tasks';
import type { TaskProjectWithRelations } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import TaskProjectDetailPageClient from '@tuturuuu/ui/tu-do/projects/projectId/task-project-detail-page-client';
import {
  getCurrentSupabaseUser,
  getCurrentUser,
} from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    projectId: string;
  }>;
}

/**
 * Shared Task Project Detail Page component.
 * Handles workspace resolution, permissions, and data fetching.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskProjectDetailPage({ params }: Props) {
  const { wsId: id, projectId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  const wsId = workspace.id;

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;
  if (withoutPermission('manage_projects')) notFound();

  const requestHeaders = await headers();
  const internalApiOptions = withForwardedInternalApiAuth(requestHeaders);

  let initialProject: TaskProjectWithRelations;
  let initialProjectData: { tasks: Task[]; lists: TaskList[] };
  try {
    [initialProject, initialProjectData] = await Promise.all([
      getWorkspaceTaskProject(wsId, projectId, internalApiOptions),
      getWorkspaceTaskProjectTasks(wsId, projectId, internalApiOptions),
    ]);
  } catch (error) {
    console.error('Error fetching task project data', error);
    notFound();
  }

  const user = await getCurrentSupabaseUser();
  if (!user) redirect('/login');

  return (
    <TaskProjectDetailPageClient
      workspace={workspace}
      projectId={projectId}
      currentUserId={user!.id}
      wsId={wsId}
      initialProject={initialProject}
      initialProjectData={initialProjectData}
    />
  );
}
