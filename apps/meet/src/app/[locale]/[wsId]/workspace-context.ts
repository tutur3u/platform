import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';

export async function getMeetWorkspaceContext(id: string) {
  const user = await getSatelliteAppSessionUser('meet');

  if (!user?.id) redirect('/');

  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (!workspace) redirect('/');
  if (!workspace.joined) redirect('/');

  const wsId = workspace.id;
  const workspaceSlug = toWorkspaceSlug(wsId, {
    personal: !!workspace.personal,
  });

  return {
    user,
    workspace,
    workspaceSlug,
    wsId,
  };
}
