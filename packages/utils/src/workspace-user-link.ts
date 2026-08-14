import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
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

async function readWorkspaceUserLink(
  supabase: TypedSupabaseClient,
  wsId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from('workspace_user_linked_users')
    .select(LINK_SELECT)
    .eq('platform_user_id', userId)
    .eq('ws_id', wsId)
    .limit(1)
    .maybeSingle();

  return {
    error,
    link: data ? toLink(data as LinkRow) : null,
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
  options: {
    authorizationClient?: TypedSupabaseClient;
    autoRepair?: boolean;
  } = {}
): Promise<WorkspaceUserLink | null> {
  const { authorizationClient, autoRepair = true } = options;
  if (!userId) return null;

  const supabase = authorizationClient ?? (await createClient());
  const resolvedWsId = resolveWorkspaceId(wsId);

  const initialLookup = await readWorkspaceUserLink(
    supabase,
    resolvedWsId,
    userId
  );

  if (initialLookup.link) return initialLookup.link;

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

    // Always re-read with the service-role client, including after an RPC
    // error. Another layout/page/API request may have repaired the same member
    // concurrently, and returning null here would turn a valid membership into
    // a route-level 404 or an empty profile-scoped module.
    const repairedLookup = await readWorkspaceUserLink(
      sbAdmin,
      resolvedWsId,
      userId
    );

    if (repairedLookup.link) return repairedLookup.link;

    if (repairError) {
      console.error(
        '[getWorkspaceUserLinkForUser] Failed to auto-repair workspace user link:',
        repairError
      );
    } else if (repairedLookup.error) {
      console.error(
        '[getWorkspaceUserLinkForUser] Failed to fetch repaired workspace user link:',
        repairedLookup.error
      );
    }
  } catch (err) {
    console.error(
      '[getWorkspaceUserLinkForUser] Error during auto-repair:',
      err
    );
  }

  return null;
}
