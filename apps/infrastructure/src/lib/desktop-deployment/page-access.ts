import 'server-only';

import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  INTERNAL_WORKSPACE_SLUG,
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  WorkspaceAuthError,
} from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';

/** Desktop-only guard: preserve existing redirects without resolving a second actor. */
export async function getDesktopPageAccess(wsId: string) {
  if (wsId.toLowerCase() === PERSONAL_WORKSPACE_SLUG)
    redirect(`/${INTERNAL_WORKSPACE_SLUG}`);
  if (resolveWorkspaceId(wsId) !== ROOT_WORKSPACE_ID)
    redirect(`/${wsId}/settings`);
  const user = await getSatelliteAppSessionUser('infra');
  if (!user) throw new WorkspaceAuthError();
  const db = await createAdminClient({ noCookie: true });
  const member = await db
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('user_id', user.id)
    .eq('type', 'MEMBER')
    .maybeSingle();
  if (member.error) throw new Error('Desktop page authorization unavailable');
  if (!member.data) redirect(`/${wsId}/settings`);
  const permissions = await getPermissions({ user, wsId: ROOT_WORKSPACE_ID });
  return {
    actorId: user.id,
    canManage:
      !!permissions &&
      !permissions.withoutPermission('manage_desktop_deployment_vault'),
  };
}
