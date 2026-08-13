import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  assignSeatToMember,
  revokeSeatFromMember,
} from '@tuturuuu/payment-core/polar-seat-helper';
import { enforceSeatLimit } from '@tuturuuu/payment-core/seat-limits';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { assignPendingWorkspaceInviteRole } from './assign-pending-role';
import {
  getWorkspaceInviteCandidateEmails,
  type WorkspaceInvitationRecord,
} from './status';

async function clearPendingInvites({
  admin,
  candidateEmails,
  userId,
  workspaceId,
}: {
  admin: TypedSupabaseClient;
  candidateEmails: string[];
  userId: string;
  workspaceId: string;
}) {
  await admin
    .from('workspace_invites')
    .delete()
    .eq('ws_id', workspaceId)
    .eq('user_id', userId);

  if (candidateEmails.length) {
    await admin
      .from('workspace_email_invites')
      .delete()
      .eq('ws_id', workspaceId)
      .in('email', candidateEmails);
  }
}

async function assignInviteRoleOrError(
  admin: TypedSupabaseClient,
  invitation: WorkspaceInvitationRecord,
  userId: string,
  workspaceId: string
) {
  try {
    await assignPendingWorkspaceInviteRole({
      admin,
      roleId: invitation.roleId,
      userId,
      workspaceId,
    });
    return null;
  } catch (roleError) {
    console.error('Failed to assign invited workspace role', {
      error: roleError,
      userId,
      workspaceId,
    });
    return NextResponse.json(
      {
        error: 'Failed to assign invited workspace role',
        errorCode: 'INVITE_ROLE_ASSIGNMENT_FAILED',
      },
      { status: 500 }
    );
  }
}

export async function acceptAppTokenInvitation({
  admin,
  authEmail,
  invitation,
  userId,
  workspaceId,
}: {
  admin: TypedSupabaseClient;
  authEmail: string | null;
  invitation: WorkspaceInvitationRecord;
  userId: string;
  workspaceId: string;
}) {
  const existingMember = await verifyWorkspaceMembershipType({
    requiredType: 'ANY',
    supabase: admin,
    userId,
    wsId: workspaceId,
  });
  const candidateEmails = await getWorkspaceInviteCandidateEmails(admin, {
    authEmail,
    userId,
  });

  if (existingMember.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace membership' },
      { status: 500 }
    );
  }

  if (existingMember.ok) {
    const roleError = await assignInviteRoleOrError(
      admin,
      invitation,
      userId,
      workspaceId
    );
    if (roleError) return roleError;
    await clearPendingInvites({ admin, candidateEmails, userId, workspaceId });
    return null;
  }

  const seatCheck = await enforceSeatLimit(admin, workspaceId);
  if (!seatCheck.allowed) {
    return NextResponse.json(
      { error: 'SEAT_LIMIT_REACHED', message: seatCheck.message },
      { status: 403 }
    );
  }

  const polar = createPolarClient();
  const { error } = await admin.from('workspace_members').insert({
    type: invitation.type,
    user_id: userId,
    ws_id: workspaceId,
  });

  if (error?.code === '23505') {
    const roleError = await assignInviteRoleOrError(
      admin,
      invitation,
      userId,
      workspaceId
    );
    if (roleError) return roleError;
    await clearPendingInvites({ admin, candidateEmails, userId, workspaceId });
    return null;
  }

  if (error) {
    console.error('Error accepting external app invite:', {
      code: error.code,
      userId,
      workspaceId,
    });
    return NextResponse.json(
      { error: 'Failed to accept invite', errorCode: 'ACCEPT_INVITE_FAILED' },
      { status: 500 }
    );
  }

  const seatAssignment = await assignSeatToMember(
    polar,
    admin,
    workspaceId,
    userId
  );
  if (seatAssignment.required && !seatAssignment.success) {
    await admin
      .from('workspace_members')
      .delete()
      .eq('ws_id', workspaceId)
      .eq('user_id', userId);
    return NextResponse.json(
      {
        error: 'POLAR_SEAT_ASSIGNMENT_FAILED',
        message: seatAssignment.error,
      },
      { status: 403 }
    );
  }

  const roleError = await assignInviteRoleOrError(
    admin,
    invitation,
    userId,
    workspaceId
  );
  if (roleError) {
    await admin
      .from('workspace_members')
      .delete()
      .eq('ws_id', workspaceId)
      .eq('user_id', userId);
    if (seatAssignment.required && seatAssignment.success) {
      await revokeSeatFromMember(polar, admin, workspaceId, userId);
    }
    return roleError;
  }

  await clearPendingInvites({ admin, candidateEmails, userId, workspaceId });
  return null;
}

export async function hasExistingWorkspaceMembership({
  admin,
  authEmail,
  userId,
  workspaceId,
}: {
  admin: TypedSupabaseClient;
  authEmail: string | null;
  userId: string;
  workspaceId: string;
}) {
  const existingMember = await verifyWorkspaceMembershipType({
    requiredType: 'ANY',
    supabase: admin,
    userId,
    wsId: workspaceId,
  });
  if (
    existingMember.error === 'membership_lookup_failed' ||
    !existingMember.ok
  ) {
    return false;
  }

  const candidateEmails = await getWorkspaceInviteCandidateEmails(admin, {
    authEmail,
    userId,
  });
  const [directInviteResult, emailInviteResult] = await Promise.all([
    admin
      .from('workspace_invites')
      .select('role_id')
      .eq('ws_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle(),
    candidateEmails.length
      ? admin
          .from('workspace_email_invites')
          .select('email, role_id')
          .eq('ws_id', workspaceId)
          .in('email', candidateEmails)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (directInviteResult.error || emailInviteResult.error) return false;

  const directInvite = directInviteResult.data;
  const emailInvites = emailInviteResult.data ?? [];
  const emailInvite = candidateEmails
    .map((email) =>
      emailInvites.find((invite) => invite.email.trim().toLowerCase() === email)
    )
    .find((invite) => Boolean(invite));
  const roleId = directInvite
    ? (directInvite.role_id ?? null)
    : (emailInvite?.role_id ?? null);

  if (!directInvite && !emailInvite) return true;
  if (!roleId) return true;

  const { data: roleMember, error: roleMemberError } = await admin
    .from('workspace_role_members')
    .select('role_id')
    .eq('role_id', roleId)
    .eq('user_id', userId)
    .maybeSingle();

  return !roleMemberError && Boolean(roleMember);
}

export async function rejectAppTokenInvitation({
  admin,
  authEmail,
  userId,
  workspaceId,
}: {
  admin: TypedSupabaseClient;
  authEmail: string | null;
  userId: string;
  workspaceId: string;
}) {
  const candidateEmails = await getWorkspaceInviteCandidateEmails(admin, {
    authEmail,
    userId,
  });
  await clearPendingInvites({ admin, candidateEmails, userId, workspaceId });
}
