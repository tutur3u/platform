import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  assignSeatToMember,
  revokeSeatFromMember,
} from '@tuturuuu/payment-core/polar-seat-helper';
import { enforceSeatLimit } from '@tuturuuu/payment-core/seat-limits';
import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  isWorkspaceUuidLiteral,
  normalizeWorkspaceId,
  resolveGuestSelfJoinCandidate,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';

type PendingInvite = {
  email?: string | null;
  role_id?: string | null;
  type: 'MEMBER' | 'GUEST';
  ws_id: string;
};

async function assignPendingInviteRole({
  roleId,
  sbAdmin,
  userId,
  wsId,
}: {
  roleId: string | null | undefined;
  sbAdmin: TypedSupabaseClient;
  userId: string;
  wsId: string;
}) {
  if (!roleId) return;

  const { data: role, error: roleError } = await sbAdmin
    .from('workspace_roles')
    .select('id, workspace_role_permissions!inner(permission, enabled)')
    .eq('id', roleId)
    .eq('ws_id', wsId)
    .eq('workspace_role_permissions.permission', 'initiate_pos_checkout')
    .eq('workspace_role_permissions.enabled', true)
    .maybeSingle();

  if (roleError || !role) {
    throw new Error('The limited POS operator role is no longer available.');
  }

  const { error: assignmentError } = await sbAdmin
    .from('workspace_role_members')
    .upsert(
      { role_id: roleId, user_id: userId },
      { ignoreDuplicates: true, onConflict: 'role_id,user_id' }
    );

  if (assignmentError) {
    throw new Error(
      assignmentError.message || 'Failed to assign limited POS operator access.'
    );
  }
}

const guestJoinReasonToErrorCodeMap: Record<string, string> = {
  already_member: 'ALREADY_MEMBER',
  no_email: 'NO_EMAIL',
  no_matching_workspace_user: 'NO_MATCHING_WORKSPACE_USER',
  workspace_user_linked_to_other_platform_user:
    'WORKSPACE_USER_LINKED_TO_OTHER_PLATFORM_USER',
};

function getSupabaseErrorMessage(
  error: { message?: unknown } | null | undefined,
  fallback: string
) {
  return typeof error?.message === 'string' && error.message.length > 0
    ? error.message
    : fallback;
}

function normalizeGuestJoinErrorCode(
  reason: string | null | undefined
): string {
  if (!reason) return 'NO_GUEST_SELF_JOIN_MATCH';
  const mapped = guestJoinReasonToErrorCodeMap[reason];
  if (mapped) return mapped;

  return reason
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export const POST = withSessionAuth<{ wsId: string }>(
  async (_request, { supabase, user }, { wsId: rawWsId }) => {
    let wsId: string;
    if (isWorkspaceUuidLiteral(rawWsId)) {
      wsId = rawWsId;
    } else {
      try {
        wsId = await normalizeWorkspaceId(rawWsId, supabase);
      } catch {
        return NextResponse.json(
          {
            error: 'Workspace not found',
            errorCode: 'WORKSPACE_NOT_FOUND',
          },
          { status: 404 }
        );
      }
    }

    if (!isWorkspaceUuidLiteral(wsId)) {
      return NextResponse.json(
        {
          error: 'Workspace not found',
          errorCode: 'WORKSPACE_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Block accepting invites for personal workspaces
    const { data: wsData } = await sbAdmin
      .from('workspaces')
      .select('personal')
      .eq('id', wsId)
      .single();

    if (wsData?.personal) {
      return NextResponse.json(
        { error: 'Cannot join a personal workspace.' },
        { status: 403 }
      );
    }

    const authEmail = user.email?.trim().toLowerCase() || null;
    const { data: privateDetails } = await sbAdmin
      .from('user_private_details')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle();
    const privateEmail = privateDetails?.email?.trim().toLowerCase() || null;
    const candidateEmails = [...new Set([authEmail, privateEmail])].filter(
      (email): email is string => typeof email === 'string' && email.length > 0
    );

    // Validate that user has a pending direct or email invite; read type for membership row.
    // This route already authenticated the actor and constrains every lookup to
    // the current user's id/email, so use the admin path to avoid browser RLS or
    // app-session differences making valid invites look missing.
    const { data: pendingInvite, error: pendingInviteError } = (await sbAdmin
      .from('workspace_invites')
      .select('ws_id, type, role_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle()) as unknown as {
      data: PendingInvite | null;
      error: { message?: string } | null;
    };

    if (pendingInviteError) {
      console.error('Failed to read pending workspace invite:', {
        error: pendingInviteError,
        userId: user.id,
        wsId,
      });
      return NextResponse.json(
        {
          error: 'Failed to read pending invite',
          errorCode: 'PENDING_INVITE_LOOKUP_FAILED',
        },
        { status: 500 }
      );
    }

    const { data: pendingEmailInviteRows, error: pendingEmailInviteError } =
      (candidateEmails.length
        ? await sbAdmin
            .from('workspace_email_invites')
            .select('ws_id, type, email, role_id')
            .eq('ws_id', wsId)
            .in('email', candidateEmails)
        : { data: null, error: null }) as unknown as {
        data: PendingInvite[] | null;
        error: { message?: string } | null;
      };

    if (pendingEmailInviteError) {
      console.error('Failed to read pending workspace email invite:', {
        candidateEmails,
        error: pendingEmailInviteError,
        userId: user.id,
        wsId,
      });
      return NextResponse.json(
        {
          error: 'Failed to read pending invite',
          errorCode: 'PENDING_INVITE_LOOKUP_FAILED',
        },
        { status: 500 }
      );
    }

    const pendingEmailInvite = Array.isArray(pendingEmailInviteRows)
      ? (pendingEmailInviteRows.find(
          (row) =>
            typeof row.email === 'string' &&
            row.email.trim().toLowerCase() === candidateEmails[0]
        ) ??
        pendingEmailInviteRows[0] ??
        null)
      : null;

    let inviteMemberType: 'MEMBER' | 'GUEST' =
      pendingInvite?.type ?? pendingEmailInvite?.type ?? 'MEMBER';
    const pendingRoleId =
      pendingInvite?.role_id ?? pendingEmailInvite?.role_id ?? null;
    let matchedWorkspaceUserId: string | null = null;

    if (!pendingInvite && !pendingEmailInvite) {
      let guestSelfJoinCandidate: Awaited<
        ReturnType<typeof resolveGuestSelfJoinCandidate>
      >;
      try {
        guestSelfJoinCandidate = await resolveGuestSelfJoinCandidate(sbAdmin, {
          authEmail,
          rpcSupabase: supabase,
          privateEmail,
          userId: user.id,
          workspaceId: wsId,
        });
      } catch (guestCandidateError) {
        console.error(
          'Failed to resolve guest self-join candidate:',
          guestCandidateError
        );
        return NextResponse.json(
          { error: 'Failed to resolve guest self-join eligibility' },
          { status: 500 }
        );
      }

      if (!guestSelfJoinCandidate.guestSelfJoinEnabled) {
        return NextResponse.json(
          {
            error: 'No pending invite found',
            errorCode: 'NO_PENDING_INVITE_FOUND',
          },
          { status: 404 }
        );
      }

      if (
        !guestSelfJoinCandidate.allowGuestSelfJoin ||
        !guestSelfJoinCandidate.virtualUserId
      ) {
        return NextResponse.json(
          {
            error: 'No pending invite found',
            errorCode: normalizeGuestJoinErrorCode(
              guestSelfJoinCandidate.reason
            ),
          },
          { status: 404 }
        );
      }

      inviteMemberType = 'GUEST';
      matchedWorkspaceUserId = guestSelfJoinCandidate.virtualUserId;
    }

    // Make acceptance idempotent for stale invites or partially completed flows.
    const existingMember = await verifyWorkspaceMembershipType({
      requiredType: 'ANY',
      wsId: wsId,
      userId: user.id,
      supabase: sbAdmin,
    });

    if (existingMember.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (existingMember.ok) {
      try {
        await assignPendingInviteRole({
          roleId: pendingRoleId,
          sbAdmin,
          userId: user.id,
          wsId,
        });
      } catch (roleError) {
        return NextResponse.json(
          {
            error:
              roleError instanceof Error
                ? roleError.message
                : 'Failed to assign invited workspace role',
            errorCode: 'INVITE_ROLE_ASSIGNMENT_FAILED',
          },
          { status: 500 }
        );
      }

      await sbAdmin
        .from('workspace_invites')
        .delete()
        .eq('ws_id', wsId)
        .eq('user_id', user.id);

      if (candidateEmails.length) {
        await sbAdmin
          .from('workspace_email_invites')
          .delete()
          .eq('ws_id', wsId)
          .in('email', candidateEmails);
      }

      return NextResponse.json({ message: 'success' });
    }

    // Check seat limit BEFORE adding member (existing gap - was missing)
    const seatCheck = await enforceSeatLimit(sbAdmin, wsId);
    if (!seatCheck.allowed) {
      return NextResponse.json(
        {
          error: 'SEAT_LIMIT_REACHED',
          message: seatCheck.message,
          seatStatus: seatCheck.status,
        },
        { status: 403 }
      );
    }

    // Assign Polar seat BEFORE adding member (if seat-based subscription)
    const polar = createPolarClient();
    const seatAssignment = await assignSeatToMember(
      polar,
      sbAdmin,
      wsId,
      user.id
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

    if (matchedWorkspaceUserId) {
      const { error: linkError } = await sbAdmin
        .from('workspace_user_linked_users')
        .upsert(
          {
            platform_user_id: user.id,
            ws_id: wsId,
            virtual_user_id: matchedWorkspaceUserId,
          },
          {
            onConflict: 'platform_user_id,ws_id',
            ignoreDuplicates: false,
          }
        );

      if (linkError) {
        if (seatAssignment.required && seatAssignment.success) {
          await revokeSeatFromMember(polar, sbAdmin, wsId, user.id);
        }

        console.error(
          'Failed to link platform user to workspace user:',
          linkError
        );
        return NextResponse.json(
          { error: 'Failed to prepare guest workspace link' },
          { status: 500 }
        );
      }
    }

    // Insert user as workspace member (preserve MEMBER vs GUEST from the invite)
    const { error } = await sbAdmin.from('workspace_members').insert({
      ws_id: wsId,
      user_id: user.id,
      type: inviteMemberType,
    });

    if (error) {
      if (error.code === '23505') {
        try {
          await assignPendingInviteRole({
            roleId: pendingRoleId,
            sbAdmin,
            userId: user.id,
            wsId,
          });
        } catch (roleError) {
          return NextResponse.json(
            {
              error:
                roleError instanceof Error
                  ? roleError.message
                  : 'Failed to assign invited workspace role',
              errorCode: 'INVITE_ROLE_ASSIGNMENT_FAILED',
            },
            { status: 500 }
          );
        }

        await sbAdmin
          .from('workspace_invites')
          .delete()
          .eq('ws_id', wsId)
          .eq('user_id', user.id);

        if (candidateEmails.length) {
          await sbAdmin
            .from('workspace_email_invites')
            .delete()
            .eq('ws_id', wsId)
            .in('email', candidateEmails);
        }

        return NextResponse.json({ message: 'success' });
      }

      // Rollback: revoke the Polar seat if it was assigned
      if (seatAssignment.required && seatAssignment.success) {
        await revokeSeatFromMember(polar, sbAdmin, wsId, user.id);
      }

      if (matchedWorkspaceUserId) {
        await sbAdmin
          .from('workspace_user_linked_users')
          .delete()
          .eq('platform_user_id', user.id)
          .eq('ws_id', wsId)
          .eq('virtual_user_id', matchedWorkspaceUserId);
      }

      console.error('Error accepting invite:', error);
      return NextResponse.json(
        {
          error: getSupabaseErrorMessage(error, 'Failed to accept invite'),
          errorCode: 'ACCEPT_INVITE_FAILED',
        },
        { status: 500 }
      );
    }

    try {
      await assignPendingInviteRole({
        roleId: pendingRoleId,
        sbAdmin,
        userId: user.id,
        wsId,
      });
    } catch (roleError) {
      await sbAdmin
        .from('workspace_members')
        .delete()
        .eq('ws_id', wsId)
        .eq('user_id', user.id);

      if (seatAssignment.required && seatAssignment.success) {
        await revokeSeatFromMember(polar, sbAdmin, wsId, user.id);
      }

      if (matchedWorkspaceUserId) {
        await sbAdmin
          .from('workspace_user_linked_users')
          .delete()
          .eq('platform_user_id', user.id)
          .eq('ws_id', wsId)
          .eq('virtual_user_id', matchedWorkspaceUserId);
      }

      console.error('Failed to assign invited workspace role:', roleError);
      return NextResponse.json(
        {
          error:
            roleError instanceof Error
              ? roleError.message
              : 'Failed to assign invited workspace role',
          errorCode: 'INVITE_ROLE_ASSIGNMENT_FAILED',
        },
        { status: 500 }
      );
    }

    // Delete the invite after accepting
    await sbAdmin
      .from('workspace_invites')
      .delete()
      .eq('ws_id', wsId)
      .eq('user_id', user.id);

    // Also delete email invite if exists
    if (candidateEmails.length) {
      await sbAdmin
        .from('workspace_email_invites')
        .delete()
        .eq('ws_id', wsId)
        .in('email', candidateEmails);
    }

    return NextResponse.json({ message: 'success' });
  },
  { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH }
);
