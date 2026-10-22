import '@tanstack/react-start/server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
export async function submitRealtimeLog([wsId, userId, kind, message, data]: [
  string,
  string | null,
  string,
  string,
  unknown?,
]) {
  const user = await getSatelliteAppSessionUser('mail');
  if (!user?.id || (userId !== null && userId !== user.id))
    throw new Error('Unauthorized');
  const workspace = await getWorkspace(wsId, { user, useAdmin: true });
  if (!workspace?.joined) throw new Error('Forbidden');
  const { addRealtimeLog } = await import(
    '@tuturuuu/supabase/next/realtime-log-actions'
  );
  await addRealtimeLog(workspace.id, user.id, kind, message, data);
}
