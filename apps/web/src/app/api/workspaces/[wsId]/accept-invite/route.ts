import { ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getWorkspaceConfig,
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

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();
  const { wsId } = await params;

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

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

  const { data: pendingEmailInvite } = candidateEmails.length
    ? await supabase
        .from('workspace_email_invites')
        .select('ws_id, type, email')
        .eq('ws_id', wsId)
        .in('email', candidateEmails)
        .maybeSingle()
    : { data: null };

  let inviteMemberType: 'MEMBER' | 'GUEST' =
    pendingInvite?.type ?? pendingEmailInvite?.type ?? 'MEMBER';
  let matchedWorkspaceUserId: string | null = null;

  if (!pendingInvite && !pendingEmailInvite) {
    const guestSelfJoinEnabled =
      (
        await getWorkspaceConfig(
          wsId,
          ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL_CONFIG_ID
        )
      )
        ?.trim()
        .toLowerCase() === 'true';

    if (!guestSelfJoinEnabled) {
      return NextResponse.json(
        {
          error: 'No pending invite found',
          errorCode: 'NO_PENDING_INVITE_FOUND',
        },
        { status: 404 }
      );
    }

    const { data: guestCandidate, error: guestCandidateError } =
      await sbAdmin.rpc('resolve_guest_self_join_candidate', {
        p_ws_id: wsId,
        p_user_id: user.id,
        p_auth_email: authEmail ?? undefined,
        p_private_email: privateEmail ?? undefined,
      });

    if (guestCandidateError) {
      console.error(
        'Failed to resolve guest self-join candidate:',
        guestCandidateError
      );
      return NextResponse.json(
        { error: 'Failed to resolve guest self-join eligibility' },
        { status: 500 }
      );
    }

    const candidateRow = guestCandidate?.[0];

    if (!candidateRow?.eligible || !candidateRow.virtual_user_id) {
      return NextResponse.json(
        {
          error: 'No pending invite found',
          errorCode: candidateRow?.reason || 'NO_GUEST_SELF_JOIN_MATCH',
        },
        { status: 404 }
      );
    }

    inviteMemberType = 'GUEST';
    matchedWorkspaceUserId = candidateRow.virtual_user_id;
  }

  // Make acceptance idempotent for stale invites or partially completed flows.
  const existingMember = await verifyWorkspaceMembershipType({
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
