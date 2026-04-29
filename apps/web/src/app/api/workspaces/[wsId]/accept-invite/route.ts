import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  resolveGuestSelfJoinCandidate,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  assignSeatToMember,
  revokeSeatFromMember,
} from '@/utils/polar-seat-helper';
import { enforceSeatLimit } from '@/utils/seat-limits';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const guestJoinReasonToErrorCodeMap: Record<string, string> = {
  already_member: 'ALREADY_MEMBER',
  no_email: 'NO_EMAIL',
  no_matching_workspace_user: 'NO_MATCHING_WORKSPACE_USER',
  workspace_user_linked_to_other_platform_user:
    'WORKSPACE_USER_LINKED_TO_OTHER_PLATFORM_USER',
};

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

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();
  const { wsId } = await params;

  // Get authenticated user
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
  const { data: pendingInvite } = await supabase
    .from('workspace_invites')
    .select('ws_id, type')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: pendingEmailInviteRows } = candidateEmails.length
    ? await supabase
        .from('workspace_email_invites')
        .select('ws_id, type, email')
        .eq('ws_id', wsId)
        .in('email', candidateEmails)
    : { data: null };

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
          errorCode: normalizeGuestJoinErrorCode(guestSelfJoinCandidate.reason),
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
}
