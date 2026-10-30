import {
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { getEffectiveAvailableSeats } from '@tuturuuu/payment-core/seat-limits';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  MAX_EMAIL_LENGTH,
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  type PermissionsResult,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate as validateUUID } from 'uuid';
import { z } from 'zod';
import { getExternalAppById } from '@/lib/app-coordination/external-apps';
import { getWorkspaceMembers } from '@/lib/workspace-members';
import { MEMBER_DEFAULT_TYPE } from './workspace-members-constants';
import { normalizeWorkspaceMembers } from './workspace-members-model';

type AdminDb = TypedSupabaseClient;
const WORKSPACE_MEMBERS_READ_SCOPE = 'workspace:members:read';
const WORKSPACE_MEMBERS_WRITE_SCOPE = 'workspace:members:write';
const WORKSPACE_ROLES_READ_SCOPE = 'workspace:roles:read';
const WORKSPACE_ROLES_WRITE_SCOPE = 'workspace:roles:write';

const inviteSchema = z.object({
  emails: z.array(z.string().email().max(MAX_EMAIL_LENGTH)).min(1).max(50),
});

type RequiredScope =
  | typeof WORKSPACE_MEMBERS_READ_SCOPE
  | typeof WORKSPACE_MEMBERS_WRITE_SCOPE
  | typeof WORKSPACE_ROLES_READ_SCOPE
  | typeof WORKSPACE_ROLES_WRITE_SCOPE;

type Capability = 'manage-members' | 'manage-roles' | 'view';

export type ExternalAppWorkspaceMembersAccess = {
  admin: AdminDb;
  canManageMembers: boolean;
  canManageRoles: boolean;
  normalizedWorkspaceId: string;
  permissions: PermissionsResult;
  targetApp: string;
  user: {
    email: string | null;
    id: string;
  };
};

function hasScope(scopes: string[], requiredScope: RequiredScope) {
  if (scopes.includes('*') || scopes.includes(requiredScope)) return true;

  return scopes.some(
    (scope) =>
      scope.endsWith(':*') && requiredScope.startsWith(scope.slice(0, -1))
  );
}

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

function accessError(message: string, status: 400 | 401 | 403 | 500) {
  return {
    ok: false as const,
    response: NextResponse.json({ error: message }, { status }),
  };
}

export async function requireExternalAppWorkspaceMembersAccess({
  capability = 'view',
  request,
  requiredScopes,
  wsId,
}: {
  capability?: Capability;
  request: Request;
  requiredScopes: RequiredScope[];
  wsId: string;
}) {
  const token = getBearerAppCoordinationToken(request);

  if (!token) {
    return accessError('Unauthorized', 401);
  }

  const verification = verifyAppCoordinationToken(token);

  if (!verification.ok) {
    return accessError('Unauthorized', 401);
  }

  for (const requiredScope of requiredScopes) {
    if (!hasScope(verification.claims.scopes, requiredScope)) {
      return accessError('Forbidden', 403);
    }
  }

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const app = await getExternalAppById(verification.claims.target_app, admin);

  if (!app?.enabled) {
    return accessError('Forbidden', 403);
  }

  let normalizedWorkspaceId: string;
  try {
    normalizedWorkspaceId = await normalizeWorkspaceIdForUser({
      admin,
      userId: verification.claims.sub,
      wsId,
    });
  } catch {
    return accessError('Forbidden', 403);
  }

  if (!app.allowedWorkspaceIds.includes(normalizedWorkspaceId.toLowerCase())) {
    return accessError('App is not linked to this workspace', 403);
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: admin,
    userId: verification.claims.sub,
    wsId: normalizedWorkspaceId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return accessError('Failed to verify workspace membership', 500);
  }

  if (!membership.ok) {
    return accessError('Forbidden', 403);
  }

  const permissions = await getPermissions({
    user: {
      email: verification.claims.email,
      id: verification.claims.sub,
    },
    wsId: normalizedWorkspaceId,
  });

  if (!permissions) {
    return accessError('Forbidden', 403);
  }

  const canManageMembers = permissions.containsPermission(
    'manage_workspace_members'
  );
  const canManageRoles = permissions.containsPermission(
    'manage_workspace_roles'
  );
  const allowed =
    capability === 'view' ||
    (capability === 'manage-members' && canManageMembers) ||
    (capability === 'manage-roles' && canManageMembers && canManageRoles);

  if (!allowed) {
    return accessError('Forbidden', 403);
  }

  return {
    admin,
    canManageMembers,
    canManageRoles,
    normalizedWorkspaceId,
    ok: true as const,
    permissions,
    targetApp: app.id,
    user: {
      email: verification.claims.email,
      id: verification.claims.sub,
    },
  };
}

export async function loadExternalAppWorkspaceMembers(
  access: ExternalAppWorkspaceMembersAccess
) {
  const members = await getWorkspaceMembers({
    sbAdmin: access.admin,
    status: 'all',
    supabase: access.admin,
    wsId: access.normalizedWorkspaceId,
  });
  const snapshot = normalizeWorkspaceMembers({
    currentUserId: access.user.id,
    members,
  });

  return {
    context: {
      canManageMembers: access.canManageMembers,
      canManageRoles: access.canManageRoles,
      defaultAdminEnabled: snapshot.defaultAdminEnabled,
    },
    invitations: snapshot.invitations,
    members: snapshot.members,
  };
}

export async function inviteExternalAppWorkspaceMembers({
  access,
  request,
}: {
  access: ExternalAppWorkspaceMembersAccess;
  request: Request;
}) {
  const validation = inviteSchema.safeParse(await request.json());

  if (!validation.success) {
    return NextResponse.json(
      { message: 'Invalid request body. Expected { emails: string[] }' },
      { status: 400 }
    );
  }

  const uniqueEmails = [
    ...new Set(validation.data.emails.map((email) => email.toLowerCase())),
  ];
  const { effectiveAvailable, status } = await getEffectiveAvailableSeats(
    access.admin,
    access.normalizedWorkspaceId
  );

  if (status.isSeatBased && effectiveAvailable < uniqueEmails.length) {
    return NextResponse.json(
      {
        availableSeats: effectiveAvailable,
        code: 'SEAT_LIMIT_REACHED',
        message: `Not enough seats to invite ${uniqueEmails.length} user(s). Available: ${effectiveAvailable}, Total seats: ${status.seatCount}.`,
        requestedCount: uniqueEmails.length,
      },
      { status: 403 }
    );
  }

  const results: Array<{ email: string; error?: string; success: boolean }> =
    [];

  for (const email of uniqueEmails) {
    const { error } = await access.admin
      .from('workspace_email_invites')
      .insert({
        email,
        invited_by: access.user.id,
        type: MEMBER_DEFAULT_TYPE,
        ws_id: access.normalizedWorkspaceId,
      });

    if (error) {
      const isDuplicate = error.message.includes('duplicate key value');
      const isSeatLimit =
        error.message.includes('workspace_has_available_seats') ||
        error.message.includes('seat');
      results.push({
        email,
        error: isDuplicate
          ? 'Already invited or member'
          : isSeatLimit
            ? 'Seat limit reached'
            : 'Failed to send invite',
        success: false,
      });
    } else {
      results.push({ email, success: true });
    }
  }

  const successCount = results.filter((result) => result.success).length;

  if (successCount > 0) {
    await access.admin.from('onboarding_progress').upsert(
      {
        invited_emails: results
          .filter((result) => result.success)
          .map((result) => result.email),
        user_id: access.user.id,
      },
      { onConflict: 'user_id' }
    );
  }

  return NextResponse.json({
    message: `${successCount} invite(s) sent successfully`,
    results,
    successCount,
    totalRequested: uniqueEmails.length,
  });
}

export {
  removeExternalAppWorkspaceMember,
  updateExternalAppWorkspaceDefaultAdmin,
  updateExternalAppWorkspaceMemberRole,
} from './workspace-members-mutations';

export const externalAppWorkspaceMemberScopes = {
  membersRead: WORKSPACE_MEMBERS_READ_SCOPE,
  membersWrite: WORKSPACE_MEMBERS_WRITE_SCOPE,
  rolesRead: WORKSPACE_ROLES_READ_SCOPE,
  rolesWrite: WORKSPACE_ROLES_WRITE_SCOPE,
} as const;
