import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
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

  // Get email from auth first so we can validate direct + email invites.
  let userEmail = user.email?.toLowerCase();

  if (!userEmail) {
    const { data: userData } = await supabase
      .from('users')
      .select('email:user_private_details(email)')
      .eq('id', user.id)
      .single();

    userEmail = (
      userData?.email as { email?: string }[] | null
    )?.[0]?.email?.toLowerCase();
  }

  // Validate that user has a pending direct or email invite; read type for membership row.
  const { data: pendingInvite } = await supabase
    .from('workspace_invites')
    .select('ws_id, type')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: pendingEmailInvite } = userEmail
    ? await supabase
        .from('workspace_email_invites')
        .select('ws_id, type')
        .eq('ws_id', wsId)
        .eq('email', userEmail)
        .maybeSingle()
    : { data: null };

  if (!pendingInvite && !pendingEmailInvite) {
    return NextResponse.json(
      { error: 'No pending invite found' },
      { status: 404 }
    );
  }

  const inviteMemberType =
    pendingInvite?.type ?? pendingEmailInvite?.type ?? 'MEMBER';

  // Make acceptance idempotent for stale invites or partially completed flows.
  const existingMember = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: sbAdmin,
  });

  if (existingMember) {
    await sbAdmin
      .from('workspace_invites')
      .delete()
      .eq('ws_id', wsId)
      .eq('user_id', user.id);

    if (userEmail) {
      await sbAdmin
        .from('workspace_email_invites')
        .delete()
        .eq('ws_id', wsId)
        .eq('email', userEmail);
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

      if (userEmail) {
        await sbAdmin
          .from('workspace_email_invites')
          .delete()
          .eq('ws_id', wsId)
          .eq('email', userEmail);
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
  if (userEmail) {
    await sbAdmin
      .from('workspace_email_invites')
      .delete()
      .eq('ws_id', wsId)
      .eq('email', userEmail);
  }

  return NextResponse.json({ message: 'success' });
}
