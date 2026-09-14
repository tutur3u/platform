import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type Actor, LettinError } from './context';

export async function resolveActor(wsId: string): Promise<Actor> {
  const user = await getSatelliteAppSessionUser('lettin');
  if (!user) throw new LettinError(401);
  const permissions = await getPermissions({ user, wsId });
  if (permissions?.membershipType !== 'MEMBER') throw new LettinError(403);
  const root = await getPermissions({
    user,
    wsId: '00000000-0000-0000-0000-000000000000',
  });
  const actor: Actor = {
    id: user.id,
    wsId: permissions.wsId,
    canManage: permissions.containsPermission('manage_documents'),
    isAdmin:
      root?.membershipType === 'MEMBER' && root.containsPermission('admin'),
    async verifiedEmail() {
      const admin = await createAdminClient();
      const { data, error } = await admin.auth.admin.getUserById(user.id);
      if (error) throw new LettinError(503);
      return data.user.email_confirmed_at
        ? (data.user.email?.toLowerCase() ?? null)
        : null;
    },
    async eligibleMember(id) {
      const target = await getPermissions({
        user: { id },
        wsId: permissions.wsId,
      });
      return (
        target?.membershipType === 'MEMBER' &&
        target.containsPermission('manage_documents')
      );
    },
    async memberNames() {
      const admin = await createAdminClient();
      const { data, error } = await admin
        .from('workspace_members')
        .select('user_id, users!inner(display_name)')
        .eq('ws_id', permissions.wsId)
        .eq('type', 'MEMBER')
        .limit(500);
      if (error) throw new LettinError(503);
      return data.map((m) => ({
        user_id: m.user_id,
        name: m.users.display_name,
      }));
    },
  };
  return actor;
}
