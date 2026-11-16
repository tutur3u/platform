import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { PermissionId } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from './constants';

/** The workspace permission that allows deleting a workspace. */
export const DELETE_WORKSPACE_PERMISSION =
  'manage_workspace_security' satisfies PermissionId;

/** Why a workspace cannot be deleted, in the order the checks apply. */
export type WorkspaceDeletionBlock =
  | 'root'
  | 'personal'
  | 'permission'
  | 'prevented'
  | 'subscription';

export type WorkspaceDeletionFacts = {
  workspaceId: string;
  personal: boolean;
  /** The actor's workspace permissions, or null for a non-member. */
  permissions: {
    containsPermission: (permission: PermissionId) => boolean;
  } | null;
  /** The workspace has the PREVENT_WORKSPACE_DELETION secret. */
  deletionPrevented: boolean;
  /** The workspace has a paid subscription that is not canceled. */
  hasActivePaidSubscription: boolean;
};

/**
 * The single deletion rule for the API, the settings card and the Danger
 * zone. The server decides; the UI uses the same result only as a hint.
 */
export function getWorkspaceDeletionBlock(
  facts: WorkspaceDeletionFacts
): WorkspaceDeletionBlock | null {
  if (facts.workspaceId === ROOT_WORKSPACE_ID) return 'root';
  if (facts.personal) return 'personal';
  if (!facts.permissions?.containsPermission(DELETE_WORKSPACE_PERMISSION)) {
    return 'permission';
  }
  if (facts.deletionPrevented) return 'prevented';
  if (facts.hasActivePaidSubscription) return 'subscription';
  return null;
}

/** Whether the typed confirmation names the workspace exactly. */
export function isWorkspaceDeletionConfirmed(
  confirmation: unknown,
  workspace: { name: string | null; handle?: string | null }
): boolean {
  if (typeof confirmation !== 'string') return false;
  const typed = confirmation.trim();
  if (!typed) return false;
  return typed === workspace.name?.trim() || typed === workspace.handle?.trim();
}

/**
 * Head-count of paid subscriptions that are not canceled, scoped to one
 * workspace. The query returns no row.
 *
 * SELECT on `workspace_subscriptions` requires `manage_subscription`, so a
 * caller-RLS client reports no active subscription for an actor who can
 * delete the workspace but cannot view billing. The delete route passes the
 * service-role client. A lookup error is returned, not hidden.
 */
export async function lookupActivePaidWorkspaceSubscription(
  client: TypedSupabaseClient,
  workspaceId: string
): Promise<{ active: boolean; error: { code?: string } | null }> {
  const { count, error } = await client
    .from('workspace_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('ws_id', workspaceId)
    .neq('status', 'canceled')
    .not('polar_subscription_id', 'is', null);
  return { active: (count ?? 0) > 0, error };
}
