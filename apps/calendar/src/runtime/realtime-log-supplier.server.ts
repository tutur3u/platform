import '@tanstack/react-start/server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

export async function recordAuthorizedRealtimeLog(data: {
  wsId: string;
  userId: string | null;
  kind: string;
  message: string;
  data?: unknown;
}) {
  const user = await getSatelliteAppSessionUser('calendar');
  if (!user?.id || (data.userId !== null && data.userId !== user.id))
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
