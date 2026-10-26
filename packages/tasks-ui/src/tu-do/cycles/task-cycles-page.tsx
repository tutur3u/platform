import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { loadTaskCycles } from './task-cycles-page-model';
import { TaskCyclesView } from './task-cycles-view';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

/**
 * Shared Task Cycles Page component.
 * Handles workspace resolution, permissions, and data fetching.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskCyclesPage({ params }: Props) {
  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  const wsId = workspace.id;

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;
  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const cycles = await loadTaskCycles(await createClient(), wsId);
  if (!cycles) notFound();

  return <TaskCyclesView wsId={wsId} initialCycles={cycles} />;
}
