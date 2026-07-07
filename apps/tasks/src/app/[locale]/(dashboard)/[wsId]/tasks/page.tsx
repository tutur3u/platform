import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { resolveTaskBoardEntrypoint } from '../task-board-entrypoint';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  await connection();

  const { wsId: id } = await params;
  const user = await getSatelliteAppSessionUser('tasks');

  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (!workspace) redirect('/onboarding');
  if (!workspace.joined) redirect('/');

  const requestHeaders = await headers();
  const boardId = await resolveTaskBoardEntrypoint(
    workspace.id,
    withForwardedInternalApiAuth(requestHeaders)
  );

  if (!boardId) redirect('/');

  const workspaceSlug = toWorkspaceSlug(workspace.id, {
    personal: workspace.personal,
  });

  redirect(`/${workspaceSlug}/boards/${boardId}`);
}
