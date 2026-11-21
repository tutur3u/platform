import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { validate as validateUUID } from 'uuid';
import { getWorkspaceInviteStatus } from '@/lib/workspace-invitations/status';

type AdminDb = TypedSupabaseClient;

export type WorkspaceSessionAppTokenExchangeAuthorization =
  | {
      normalizedWorkspaceId: string;
      ok: true;
    }
  | {
      code?: 'PENDING_WORKSPACE_INVITE';
      error: string;
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
      normalizedWorkspaceId,
      ok: false,
      status: 403,
    };
  }

  return {
    error: 'Forbidden',
    ok: false,
    status: 403,
  };
}
