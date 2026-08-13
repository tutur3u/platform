import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  assignSeatToMember,
  revokeAssignedSeat,
} from '@tuturuuu/payment-core/polar-seat-helper';
import { enforceSeatLimit } from '@tuturuuu/payment-core/seat-limits';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { finalizeInvitedWorkspaceMembership } from './finalize-membership';
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

async function finalizeMembershipOrError(
  admin: TypedSupabaseClient,
  invitation: WorkspaceInvitationRecord,
  userId: string,
  workspaceId: string
) {
  try {
    const result = await finalizeInvitedWorkspaceMembership({
      admin,
      invitationType: invitation.type,
      roleId: invitation.roleId,
      userId,
      workspaceId,
    });
    return { response: null, ...result };
  } catch (roleError) {
    console.error('Failed to assign invited workspace role', {
      error: roleError,
      userId,
      workspaceId,
    });
    return {
      created: false,
      response: NextResponse.json(
        {
          error: 'Failed to finalize invited workspace access',
          errorCode: 'INVITE_ROLE_ASSIGNMENT_FAILED',
        },
        { status: 500 }
      ),
    };
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
    const finalized = await finalizeMembershipOrError(
      admin,
      invitation,
      userId,
      workspaceId
    );
    if (finalized.response) return finalized.response;
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
  const seatAssignment = await assignSeatToMember(
    polar,
    admin,
    workspaceId,
    userId
  );
  if (seatAssignment.required && !seatAssignment.success) {
    return NextResponse.json(
      {
        error: 'POLAR_SEAT_ASSIGNMENT_FAILED',
        message: seatAssignment.error,
      },
      { status: 403 }
    );
  }

  const finalized = await finalizeMembershipOrError(
    admin,
    invitation,
    userId,
    workspaceId
  );
  if (finalized.response) {
    if (seatAssignment.required) {
      await revokeAssignedSeat(polar, seatAssignment.seatId);
    }
    return finalized.response;
  }

  if (!finalized.created && seatAssignment.required) {
    await revokeAssignedSeat(polar, seatAssignment.seatId);
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
      .select('role_id, type')
      .eq('ws_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle(),
    candidateEmails.length
      ? admin
          .from('workspace_email_invites')
          .select('email, role_id, type')
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
  const invitationType = directInvite?.type ?? emailInvite?.type ?? null;

  if (!directInvite && !emailInvite) return true;
  // A pending roleless invite means the acceptance flow has not completed its
  // seat assignment and invite cleanup yet. Do not mint a session from the
  // transient membership row created before those steps finish.
  if (!roleId) return false;
  if (
    invitationType === 'MEMBER' &&
    existingMember.membershipType !== 'MEMBER'
  ) {
    return false;
  }

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
