import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { validate as validateUUID } from 'uuid';
import {
  getWorkspaceInviteStatus,
  type WorkspaceInvitationRecord,
} from '@/lib/workspace-invitations/status';

type AdminDb = TypedSupabaseClient;

export type WorkspaceSessionAppTokenExchangeAuthorization =
  | {
      normalizedWorkspaceId: string;
      ok: true;
    }
  | {
      code?: 'NOT_A_MEMBER' | 'PENDING_WORKSPACE_INVITE';
      error: string;
      invitation?: WorkspaceInvitationRecord;
      normalizedWorkspaceId?: string;
      ok: false;
      status: 400 | 403 | 500;
    };

function isWorkspaceHandleCandidate(value: string) {
  return /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u.test(value);
}

async function normalizeWorkspaceIdForUser({
  admin,
  userId,
  wsId,
}: {
  admin: AdminDb;
  userId: string;
  wsId: string;
}) {
  const resolvedWorkspaceId = resolveWorkspaceId(wsId);

  if (resolvedWorkspaceId === ROOT_WORKSPACE_ID) {
    return ROOT_WORKSPACE_ID;
  }

  if (resolvedWorkspaceId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const { data, error } = await admin
      .from('workspaces')
      .select('id, workspace_members!inner(user_id, type)')
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .eq('workspace_members.type', 'MEMBER')
      .maybeSingle();

    if (error || !data?.id) {
      throw new Error('Personal workspace not found');
    }

    return data.id;
  }

  if (validateUUID(resolvedWorkspaceId)) {
    return resolvedWorkspaceId;
  }

  const handle = resolvedWorkspaceId.trim().toLowerCase();

  if (!isWorkspaceHandleCandidate(handle)) {
    return resolvedWorkspaceId;
  }

  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('handle', handle)
    .maybeSingle();

  return data?.id ?? resolvedWorkspaceId;
}

export async function authorizeWorkspaceSessionAppTokenExchange({
  admin,
  allowedWorkspaceIds,
  authEmail,
  userId,
  workspaceId,
}: {
  admin: AdminDb;
  allowedWorkspaceIds: string[];
  authEmail?: string | null;
  userId: string;
  workspaceId?: string;
}): Promise<WorkspaceSessionAppTokenExchangeAuthorization> {
  if (!workspaceId?.trim()) {
    return {
      error: 'Missing workspace ID for workspace session scope',
      ok: false,
      status: 400,
    };
  }

  let normalizedWorkspaceId: string;

  try {
    normalizedWorkspaceId = await normalizeWorkspaceIdForUser({
      admin,
      userId,
      wsId: workspaceId,
    });
  } catch {
    return {
      error: 'Forbidden',
      ok: false,
      status: 403,
    };
  }

  if (!allowedWorkspaceIds.includes(normalizedWorkspaceId.toLowerCase())) {
    return {
      error: 'App is not linked to this workspace',
      ok: false,
      status: 403,
    };
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: admin,
    userId,
    wsId: normalizedWorkspaceId,
  });

  if (membership.ok) {
    return {
      normalizedWorkspaceId,
      ok: true,
    };
  }

  if (membership.error === 'membership_lookup_failed') {
    return {
      error: 'Failed to verify workspace membership',
      ok: false,
      status: 500,
    };
  }

  const inviteStatus = await getWorkspaceInviteStatus(admin, {
    authEmail: authEmail ?? null,
    userId,
    workspaceId: normalizedWorkspaceId,
  });

  if (inviteStatus.status === 'pending_invite') {
    return {
      code: 'PENDING_WORKSPACE_INVITE',
      error: 'Pending workspace invitation',
      invitation: inviteStatus.invitation,
      normalizedWorkspaceId,
      ok: false,
      status: 403,
    };
  }

  // Authoritative denial: the lookup found the user as a GUEST, or found no
  // row and the invite check agrees there is none. If the invite check now
  // sees a membership (a concurrent join), stay generic rather than let the
  // caller revoke someone who just became a member.
  // A GUEST is re-read once so a concurrent upgrade to MEMBER is not
  // reported as a denial.
  const authoritative =
    membership.error === 'membership_type_mismatch'
      ? (
          await verifyWorkspaceMembershipType({
            requiredType: 'MEMBER',
            supabase: admin,
            userId,
            wsId: normalizedWorkspaceId,
          })
        ).error === 'membership_type_mismatch'
      : membership.error === 'membership_missing' &&
        inviteStatus.status === 'none';

  return {
    ...(authoritative ? { code: 'NOT_A_MEMBER' as const } : {}),
    error: 'Forbidden',
    ok: false,
    status: 403,
  };
}

/**
 * Confirms a refresh-grant membership refusal before the exchange reports
 * `NOT_A_MEMBER`. The grant check reads membership once; this re-runs the full
 * workspace-session authorization (link check, pending invite, concurrent
 * join, GUEST re-read) for the refresh token's own bound workspace, and only
 * when the request names no other workspace.
 */
export async function confirmRefreshNotAMember({
  admin,
  allowedWorkspaceIds,
  claims,
  requestedWorkspaceId,
}: {
  admin: AdminDb;
  allowedWorkspaceIds: string[];
  claims: { email?: string | null; sub: string; workspace_id?: string };
  requestedWorkspaceId?: string;
}) {
  const bound = claims.workspace_id?.trim();
  const requested = requestedWorkspaceId?.trim();
  if (!bound) return false;
  if (requested && requested.toLowerCase() !== bound.toLowerCase()) {
    return false;
  }

  const authorization = await authorizeWorkspaceSessionAppTokenExchange({
    admin,
    allowedWorkspaceIds,
    authEmail: claims.email ?? null,
    userId: claims.sub,
    workspaceId: bound,
  });

  return !authorization.ok && authorization.code === 'NOT_A_MEMBER';
}
