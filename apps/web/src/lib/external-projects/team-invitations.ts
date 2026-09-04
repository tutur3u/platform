import { getEffectiveAvailableSeats } from '@tuturuuu/payment-core/seat-limits';
import { MAX_COLOR_LENGTH, MAX_EMAIL_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type {
  EnhancedWorkspaceMember,
  WorkspaceMemberRole,
} from '@/lib/workspace-members';
import type { ExternalProjectTeamAccess } from './team-access';

const TeamInviteSchema = z.object({
  emails: z
    .array(z.string().email().max(MAX_EMAIL_LENGTH))
    .min(1)
    .max(MAX_COLOR_LENGTH),
  roleIds: z.array(z.uuid()).max(50).optional().default([]),
});

const TeamInviteRoleUpdateSchema = z.object({
  email: z.email().max(MAX_EMAIL_LENGTH),
  roleIds: z.array(z.uuid()).max(50),
});

type InvitationRoleListRow = {
  email: null | string;
  role_ids: string[];
  user_id: null | string;
};

type InvitationRoleRpcClient = {
  rpc: (
    functionName: 'list_workspace_invitation_role_ids',
    args: { p_ws_id: string }
  ) => Promise<{
    data: InvitationRoleListRow[] | null;
    error: { message?: string } | null;
  }>;
};

type CreateEmailInvitationRpcClient = {
  rpc: (
    functionName: 'create_workspace_email_invitation_with_roles',
    args: {
      p_email: string;
      p_invited_by: string;
      p_member_type: 'MEMBER';
      p_role_ids: string[];
      p_ws_id: string;
    }
  ) => Promise<{ error: { message: string } | null }>;
};

type SetInvitationRolesRpcClient = {
  rpc: (
    functionName: 'set_workspace_invitation_roles',
    args: {
      p_email: string;
      p_role_ids: string[];
      p_user_id: null;
      p_ws_id: string;
    }
  ) => Promise<{ error: { message?: string } | null }>;
};

export async function attachExternalProjectInvitationRoles({
  access,
  members,
}: {
  access: ExternalProjectTeamAccess;
  members: EnhancedWorkspaceMember[];
}) {
  const privateDb = access.admin.schema(
    'private'
  ) as unknown as InvitationRoleRpcClient;
  const invitations = await privateDb.rpc(
    'list_workspace_invitation_role_ids',
    { p_ws_id: access.normalizedWorkspaceId }
  );

  if (invitations.error) {
    throw new Error(
      invitations.error.message || 'Failed to load invitation access levels.'
    );
  }

  const roleIds = [
    ...new Set((invitations.data ?? []).flatMap((invite) => invite.role_ids)),
  ];
  const roleById = new Map<string, { id: string; name: string }>();

  if (roleIds.length > 0) {
    const roles = await access.admin
      .from('workspace_roles')
      .select('id, name')
      .eq('ws_id', access.normalizedWorkspaceId)
      .in('id', roleIds);

    if (roles.error) throw roles.error;
    for (const role of roles.data ?? []) roleById.set(role.id, role);
  }

  const rolesByIdentity = new Map<string, WorkspaceMemberRole[]>();
  for (const invitation of invitations.data ?? []) {
    const roles = invitation.role_ids.flatMap((roleId) => {
      const role = roleById.get(roleId);
      return role ? [{ ...role, permissions: [] }] : [];
    });
    if (invitation.email) {
      rolesByIdentity.set(
        `email:${invitation.email.trim().toLowerCase()}`,
        roles
      );
    }
    if (invitation.user_id) {
      rolesByIdentity.set(`user:${invitation.user_id}`, roles);
    }
  }

  return members.map((member) => {
    if (!member.pending) return member;
    const inviteRoles =
      (member.id ? rolesByIdentity.get(`user:${member.id}`) : undefined) ??
      (member.email
        ? rolesByIdentity.get(`email:${member.email.trim().toLowerCase()}`)
        : undefined);
    return inviteRoles ? { ...member, roles: inviteRoles } : member;
  });
}

async function validateInvitationRoles({
  access,
  roleIds,
}: {
  access: ExternalProjectTeamAccess;
  roleIds: string[];
}) {
  const uniqueRoleIds = [...new Set(roleIds)];
  if (uniqueRoleIds.length === 0) return { ok: true as const, roleIds: [] };

  if (!access.canManageRoles) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'You do not have permission to assign access levels.' },
        { status: 403 }
      ),
    };
  }

  const roles = await access.admin
    .from('workspace_roles')
    .select('id')
    .eq('ws_id', access.normalizedWorkspaceId)
    .in('id', uniqueRoleIds);

  if (roles.error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Error validating invitation access levels.' },
        { status: 500 }
      ),
    };
  }

  if (roles.data?.length !== uniqueRoleIds.length) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'One or more selected access levels are not available.' },
        { status: 400 }
      ),
    };
  }

  return { ok: true as const, roleIds: uniqueRoleIds };
}

export async function inviteExternalProjectTeamMembers({
  access,
  request,
}: {
  access: ExternalProjectTeamAccess;
  request: Request;
}) {
  const validation = TeamInviteSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!validation.success) {
    return NextResponse.json(
      {
        message:
          'Invalid request body. Expected { emails: string[], roleIds?: string[] }',
      },
      { status: 400 }
    );
  }

  const roleValidation = await validateInvitationRoles({
    access,
    roleIds: validation.data.roleIds,
  });
  if (!roleValidation.ok) return roleValidation.response;

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
  const invitationDb = access.admin.schema(
    'private'
  ) as unknown as CreateEmailInvitationRpcClient;

  for (const email of uniqueEmails) {
    const { error } = await invitationDb.rpc(
      'create_workspace_email_invitation_with_roles',
      {
        p_email: email,
        p_invited_by: access.user.id,
        p_member_type: 'MEMBER',
        p_role_ids: roleValidation.roleIds,
        p_ws_id: access.normalizedWorkspaceId,
      }
    );

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

  const successfulEmails = results
    .filter((result) => result.success)
    .map((result) => result.email);
  if (successfulEmails.length > 0) {
    await access.admin
      .from('onboarding_progress')
      .upsert(
        { invited_emails: successfulEmails, user_id: access.user.id },
        { onConflict: 'user_id' }
      );
  }

  return NextResponse.json({
    message: `${successfulEmails.length} invite(s) sent successfully`,
    results,
    successCount: successfulEmails.length,
    totalRequested: uniqueEmails.length,
  });
}

export async function updateExternalProjectTeamInvitationRoles({
  access,
  request,
}: {
  access: ExternalProjectTeamAccess;
  request: Request;
}) {
  const validation = TeamInviteRoleUpdateSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!validation.success) {
    return NextResponse.json(
      { message: 'Choose a valid pending invitation and access level.' },
      { status: 400 }
    );
  }

  const roleValidation = await validateInvitationRoles({
    access,
    roleIds: validation.data.roleIds,
  });
  if (!roleValidation.ok) return roleValidation.response;

  const email = validation.data.email.trim().toLowerCase();
  const invite = await access.admin
    .from('workspace_email_invites')
    .select('email')
    .eq('ws_id', access.normalizedWorkspaceId)
    .eq('email', email)
    .maybeSingle();

  if (invite.error) {
    return NextResponse.json(
      { message: 'Error updating invitation access.' },
      { status: 500 }
    );
  }
  if (!invite.data) {
    return NextResponse.json(
      { message: 'Pending invitation not found.' },
      { status: 404 }
    );
  }

  const privateDb = access.admin.schema(
    'private'
  ) as unknown as SetInvitationRolesRpcClient;
  const result = await privateDb.rpc('set_workspace_invitation_roles', {
    p_email: email,
    p_role_ids: roleValidation.roleIds,
    p_user_id: null,
    p_ws_id: access.normalizedWorkspaceId,
  });

  if (result.error) {
    return NextResponse.json(
      { message: 'Error updating invitation access.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
