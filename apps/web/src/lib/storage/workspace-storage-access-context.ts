import {
  memoizeWorkspaceStorageAccessContext,
  type WorkspaceStorageAccessContext,
} from '@tuturuuu/storage-core/workspace-storage-access';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';

export class WorkspaceStorageAccessLookupError extends Error {}

/**
 * Binds the shared `workspaces` bucket access rules to Supabase lookups.
 * Membership is read with the request-scoped client; Drive permissions and
 * chat ownership use the admin client because they mirror security-definer
 * RLS helpers (has_workspace_permission, ai_chats ownership).
 */
export function createWorkspaceStorageAccessContext({
  sbAdmin,
  supabase,
  userId,
}: {
  sbAdmin: TypedSupabaseClient;
  supabase: TypedSupabaseClient;
  userId: string;
}): WorkspaceStorageAccessContext {
  const hasPermission = async (wsId: string, permission: string) => {
    const { data, error } = await sbAdmin.rpc('has_workspace_permission', {
      p_permission: permission,
      p_user_id: userId,
      p_ws_id: wsId,
    });
    if (error) {
      throw new WorkspaceStorageAccessLookupError(
        'Failed to verify workspace permission',
        { cause: error }
      );
    }
    return data === true;
  };

  return memoizeWorkspaceStorageAccessContext({
    userId,
    async isWorkspaceMember(wsId) {
      const membership = await verifyWorkspaceMembershipType({
        supabase,
        userId,
        wsId,
      });
      if (membership.error === 'membership_lookup_failed') {
        throw new WorkspaceStorageAccessLookupError(
          'Failed to verify workspace membership'
        );
      }
      return membership.ok;
    },
    async getDrivePermissions(wsId) {
      const [view, manage] = await Promise.all([
        hasPermission(wsId, 'view_drive'),
        hasPermission(wsId, 'manage_drive'),
      ]);
      return { manage, view };
    },
    async getAiChatCreatorId(chatId) {
      const { data, error } = await sbAdmin
        .from('ai_chats')
        .select('creator_id')
        .eq('id', chatId)
        .maybeSingle();
      if (error) {
        throw new WorkspaceStorageAccessLookupError(
          'Failed to verify chat ownership',
          { cause: error }
        );
      }
      return data?.creator_id ?? null;
    },
  });
}
