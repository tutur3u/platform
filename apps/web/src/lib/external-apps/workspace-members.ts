import {
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { getEffectiveAvailableSeats } from '@tuturuuu/payment-core/seat-limits';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MAX_EMAIL_LENGTH } from '@tuturuuu/utils/constants';
import { hasGrantedScope } from '@tuturuuu/utils/external-app-registry-policy';
import {
  getPermissions,
  type PermissionsResult,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireLiveExternalApp } from '@/lib/app-coordination/external-app-bearer';
import {
  normalizeExternalAppWorkspaceId,
  rejectExternalAppTokenWorkspace,
} from '@/lib/app-coordination/external-app-workspace';
import { getWorkspaceMembers } from '@/lib/workspace-members';
import { MEMBER_DEFAULT_TYPE } from './workspace-members-constants';
import { normalizeWorkspaceMembers } from './workspace-members-model';

type AdminDb = TypedSupabaseClient;
const WORKSPACE_MEMBERS_READ_SCOPE = 'workspace:members:read';
const WORKSPACE_MEMBERS_WRITE_SCOPE = 'workspace:members:write';
// Explicit-only: no wildcard grant covers it.
const WORKSPACE_MEMBERS_EMAIL_READ_SCOPE = 'workspace.members.email:read';
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
  canReadMemberEmails: boolean;
  normalizedWorkspaceId: string;
  permissions: PermissionsResult;
  targetApp: string;
  user: {
    email: string | null;
    id: string;
  };
};

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
    if (!hasGrantedScope(verification.claims.scopes, requiredScope)) {
      return accessError('Forbidden', 403);
    }
  }

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const issuer = await requireLiveExternalApp(admin, verification.claims);
  if (!issuer.ok) return issuer;
  const { app } = issuer;

  let normalizedWorkspaceId: string;
  try {
    normalizedWorkspaceId = await normalizeExternalAppWorkspaceId({
      admin,
      userId: verification.claims.sub,
      wsId,
    });
  } catch {
    return accessError('Forbidden', 403);
  }

  const workspaceRejection = rejectExternalAppTokenWorkspace(
    verification.claims,
    normalizedWorkspaceId
  );
  if (workspaceRejection) {
    return { ok: false as const, response: workspaceRejection };
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

  // Emails need the explicit scope plus the permissions the first-party
  // members list requires (`/api/workspaces/{wsId}/members/enhanced`).
  const canReadMemberEmails =
    hasGrantedScope(
      verification.claims.scopes,
      WORKSPACE_MEMBERS_EMAIL_READ_SCOPE
    ) &&
    canManageMembers &&
    canManageRoles;

  return {
    admin,
    canManageMembers,
    canManageRoles,
    canReadMemberEmails,
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
    includeEmails: access.canReadMemberEmails,
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
  membersEmailRead: WORKSPACE_MEMBERS_EMAIL_READ_SCOPE,
  membersRead: WORKSPACE_MEMBERS_READ_SCOPE,
  membersWrite: WORKSPACE_MEMBERS_WRITE_SCOPE,
  rolesRead: WORKSPACE_ROLES_READ_SCOPE,
  rolesWrite: WORKSPACE_ROLES_WRITE_SCOPE,
} as const;
