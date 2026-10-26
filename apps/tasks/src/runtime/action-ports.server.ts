import '@tanstack/react-start/server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

/** Server halves of the native action ports; each re-checks the actor. */

async function requireActor() {
  const user = await getSatelliteAppSessionUser('tasks');
  if (!user?.id) throw new Error('Unauthorized');
  return user;
}

export async function fetchAuthorizedWorkspaces() {
  await requireActor();
  const { fetchSatelliteWorkspaces } = await import(
    '../../../../packages/satellite/src/utils/workspace-actions'
  );
  return fetchSatelliteWorkspaces();
}

export async function listAuthorizedPublicBoardTemplates() {
  await requireActor();
  const { listPublicBoardTemplates } = await import(
    '../components/settings/template-marketplace-actions'
  );
  return listPublicBoardTemplates();
}

export async function recordAuthorizedRealtimeLog(data: {
  wsId: string;
  userId: string | null;
  kind: string;
  message: string;
  data?: unknown;
}) {
  const user = await requireActor();
  if (data.userId !== null && data.userId !== user.id)
    throw new Error('Unauthorized');
  const workspace = await getWorkspace(data.wsId, { useAdmin: true, user });
  if (!workspace?.joined) throw new Error('Unauthorized');
  const { addRealtimeLog } = await import(
    '../../../../packages/supabase/src/next/realtime-log-actions'
  );
  return addRealtimeLog(
    workspace.id,
    user.id,
    data.kind,
    data.message,
    data.data
  );
}
