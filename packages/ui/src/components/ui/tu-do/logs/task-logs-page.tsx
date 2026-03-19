import {
  listWorkspaceTaskBoards,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import LogsClient from '@tuturuuu/ui/tu-do/logs/logs-client';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

/**
 * Shared Task Logs Page component.
 * Handles workspace resolution, permissions, and data fetching.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskLogsPage({ params }: Props) {
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

  const boardsPayload = await listWorkspaceTaskBoards(
    wsId,
    undefined,
    withForwardedInternalApiAuth(await headers())
  );

  const boards = boardsPayload.boards.filter((board) => !board.deleted_at);

  const boardList = (boards || []).map((b) => ({ id: b.id, name: b.name }));
  const estimationTypes: Record<string, string | null> = {};
  (boards || []).forEach((b) => {
    estimationTypes[b.id] = b.estimation_type ?? null;
  });

  return (
    <LogsClient
      wsId={wsId}
      boards={boardList}
      estimationTypes={estimationTypes}
    />
  );
}
