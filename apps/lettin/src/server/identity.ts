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
      const members: { user_id: string; name: string | null }[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await admin
          .from('workspace_members')
          .select('user_id, users!inner(display_name)')
          .eq('ws_id', permissions.wsId)
          .eq('type', 'MEMBER')
          .order('user_id')
          .range(offset, offset + 499);
        if (error) throw new LettinError(503);
        members.push(
          ...data.map((m) => ({
            user_id: m.user_id,
            name: m.users.display_name,
          }))
        );
        if (data.length < 500) break;
      }
      return members;
    },
  };
  return actor;
}
