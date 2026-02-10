import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
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

export async function POST(_: Request, { params }: Params) {
  const supabase = await createClient();
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

  // Validate that user has a pending invite
  const { data: pendingInvite } = await supabase
    .from('workspace_invites')
    .select('id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .single();

  if (!pendingInvite) {
    return NextResponse.json(
      { error: 'No pending invite found' },
      { status: 404 }
    );
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

  // Insert user as workspace member
  const { error } = await supabase
    .from('workspace_members')
    .insert({ ws_id: wsId, user_id: user.id });

  if (error) {
    // Rollback: revoke the Polar seat if it was assigned
    if (seatAssignment.required && seatAssignment.success) {
      await revokeSeatFromMember(polar, sbAdmin, wsId, user.id);
    }

    console.error('Error accepting invite:', error);
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  // Delete the invite after accepting
  await supabase
    .from('workspace_invites')
    .delete()
    .eq('ws_id', wsId)
    .eq('user_id', user.id);

  // Also delete email invite if exists
  // Get email from auth (more reliable)
  let userEmail = user.email;

  // Fallback: try from user_private_details
  if (!userEmail) {
    const { data: userData } = await supabase
      .from('users')
      .select('email:user_private_details(email)')
      .eq('id', user.id)
      .single();

    userEmail = (userData?.email as any)?.[0]?.email;
  }

  if (userEmail) {
    await supabase
      .from('workspace_email_invites')
      .delete()
      .eq('ws_id', wsId)
      .eq('email', userEmail);
  }

  return NextResponse.json({ message: 'success' });
}
