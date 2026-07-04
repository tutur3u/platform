import {
  getUserWorkspaceConfig,
  listWorkspaceBoards,
  TASK_DEFAULT_BOARD_ID_CONFIG_ID,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import MyTasksPage from '@tuturuuu/ui/tu-do/my-tasks/my-tasks-page';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createElement } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function resolveBoardEntrypoint(
  workspaceId: string,
  internalApiOptions: Parameters<typeof listWorkspaceBoards>[1]
) {
  const { boards } = await listWorkspaceBoards(workspaceId, internalApiOptions);
  const firstBoardId = boards[0]?.id ?? null;

  if (!firstBoardId) {
    return null;
  }

  try {
    const { value } = await getUserWorkspaceConfig(
      workspaceId,
      TASK_DEFAULT_BOARD_ID_CONFIG_ID,
      internalApiOptions
    );

    if (value && boards.some((board) => board.id === value)) {
      return value;
    }
  } catch {
    return firstBoardId;
  }

  return firstBoardId;
}

export default async function Page({ params }: Props) {
  await connection();

  const { wsId: id } = await params;
  const user = await getSatelliteAppSessionUser('tasks');

  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (workspace?.id) {
    const requestHeaders = await headers();
    let boardId: string | null = null;

    try {
      boardId = await resolveBoardEntrypoint(
        workspace.id,
        withForwardedInternalApiAuth(requestHeaders)
      );
    } catch {
      // Keep the My Tasks empty-board creation flow available when the
      // navigation lookup fails.
    }

    if (boardId) {
      const workspaceSlug = toWorkspaceSlug(workspace.id, {
        personal: workspace.personal,
      });

      redirect(`/${workspaceSlug}/boards/${boardId}`);
    }
  }

  return createElement(MyTasksPage, {
    params: Promise.resolve({ wsId: id }),
    user,
  });
}
