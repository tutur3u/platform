import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { resolveWorkspaceId } from './constants';
import { verifyWorkspaceMembershipType } from './workspace-helper';

export interface WorkspaceUserLink {
  platform_user_id: string;
  virtual_user_id: string;
  ws_id: string;
  created_at: string;
  workspace_users?: WorkspaceUser;
}

const LINK_SELECT =
  'platform_user_id, virtual_user_id, ws_id, created_at, workspace_users!virtual_user_id(*)';

type LinkRow = {
  platform_user_id: string;
  virtual_user_id: string;
  ws_id: string;
  created_at: string;
  workspace_users?: unknown;
};

function toLink(row: LinkRow): WorkspaceUserLink {
  const linkedData = row.workspace_users;
  return {
    platform_user_id: row.platform_user_id,
    virtual_user_id: row.virtual_user_id,
    ws_id: row.ws_id,
    created_at: row.created_at,
    ...(linkedData ? { workspace_users: linkedData as WorkspaceUser } : {}),
  };
}

/**
 * Resolves the workspace-user link for an EXPLICIT platform user id.
 *
 * `getCurrentWorkspaceUser` (user-helper) resolves the actor from Supabase auth
 * and then delegates here. Satellite apps must not do that: they resolve the
 * actor from Tuturuuu app-session auth (`getSatelliteAppSessionUser`) and pass
 * the id in, which is why this lives outside `user-helper` — the internal-app-auth
 * guard forbids registered apps from importing that module.
 */
export async function getWorkspaceUserLinkForUser(
  wsId: string,
  userId: string,
  options: { autoRepair?: boolean } = {}
): Promise<WorkspaceUserLink | null> {
  const { autoRepair = true } = options;
  if (!userId) return null;

  const supabase = await createClient();
  const resolvedWsId = resolveWorkspaceId(wsId);

  const { data: workspaceUser } = await supabase
    .from('workspace_user_linked_users')
    .select(LINK_SELECT)
    .eq('platform_user_id', userId)
    .eq('ws_id', resolvedWsId)
    .limit(1)
    .maybeSingle();

  if (workspaceUser) return toLink(workspaceUser as LinkRow);

  if (!autoRepair) return null;

  const membership = await verifyWorkspaceMembershipType({
    wsId: resolvedWsId,
    userId,
    supabase,
    requiredType: 'MEMBER',
  });

  if (!membership.ok) return null;

  try {
    const sbAdmin = await createAdminClient();
    // Note: ensure_workspace_user_link is defined in migration 20260112060000.
    // IMPORTANT: must use .bind() to preserve the Supabase client's `this` context.
    const rpc = sbAdmin.rpc.bind(sbAdmin) as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ error: Error | null }>;
    const { error: repairError } = await rpc('ensure_workspace_user_link', {
      target_user_id: userId,
      target_ws_id: resolvedWsId,
    });

    if (repairError) {
      console.error(
        '[getWorkspaceUserLinkForUser] Failed to auto-repair workspace user link:',
        repairError
      );
      return null;
    }

    const { data: repairedUser } = await supabase
      .from('workspace_user_linked_users')
      .select(LINK_SELECT)
      .eq('platform_user_id', userId)
      .eq('ws_id', resolvedWsId)
      .limit(1)
      .maybeSingle();

    if (repairedUser) return toLink(repairedUser as LinkRow);
  } catch (err) {
    console.error(
      '[getWorkspaceUserLinkForUser] Error during auto-repair:',
      err
    );
  }

  return null;
}
