import type { Polar } from '@tuturuuu/payment/polar';
import { createPolarClient } from '@tuturuuu/payment/polar/client';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const normalizeWorkspaceId = async (wsId: string) => {
  if (wsId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const workspace = await getWorkspace(wsId);
    return workspace.id;
  }

  return resolveWorkspaceId(wsId);
};

export async function GET(_: NextRequest, { params }: Params) {
  const { wsId: id } = await params;
  const supabase = await createClient();

  const wsId = await normalizeWorkspaceId(id);

  // Fetch workspace creator_id
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', wsId)
    .single();

  const creatorId = workspace?.creator_id;

  const { data, error } = await supabase
    .from('workspace_members')
    .select(
      `
      user_id,
      users!inner(
        id,
        display_name,
        avatar_url,
        ...user_private_details(email)
      )
    `
    )
    .eq('ws_id', wsId);

  if (error) {
    console.error('Error fetching workspace members:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace members' },
      { status: 500 }
    );
  }

  // Transform the data to flatten the user information and add is_creator field
  // Include both id and user_id for compatibility with task assignment flows
  const members =
    data?.map((member) => ({
      id: member.users.id,
      user_id: member.user_id, // Include user_id for task creation consistency
      display_name: member.users.display_name,
      email: member.users.email,
      avatar_url: member.users.avatar_url,
      is_creator: member.users.id === creatorId,
    })) || [];

  return NextResponse.json({ members });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const searchParams = req.nextUrl.searchParams;

  const userId = searchParams.get('id');
  const userEmail = searchParams.get('email');

  const supabase = await createClient();
  const resolvedWsId = await normalizeWorkspaceId(wsId);

  // Revoke Polar seat BEFORE deleting member (best-effort)
  if (userId) {
    const polar = createPolarClient();
    const sbAdmin = await createAdminClient();
    await revokeSeatFromMember(polar, sbAdmin, resolvedWsId, userId);
  }

  const inviteQuery = userId
    ? supabase
        .from('workspace_invites')
        .delete()
        .eq('ws_id', resolvedWsId)
        .eq('user_id', userId)
    : { error: undefined };

  const emailInviteQuery = userEmail
    ? supabase
        .from('workspace_email_invites')
        .delete()
        .eq('ws_id', resolvedWsId)
        .eq('email', userEmail)
    : { error: undefined };

  const memberQuery = userId
    ? supabase
        .from('workspace_members')
        .delete()
        .eq('ws_id', resolvedWsId)
        .eq('user_id', userId)
    : { error: undefined };

  // use Promise.all to run all queries in parallel
  const [inviteData, emailInviteData, memberData] = await Promise.all([
    inviteQuery,
    emailInviteQuery,
    memberQuery,
  ]);

  if (inviteData.error || emailInviteData.error || memberData.error) {
    console.log(inviteData.error, emailInviteData.error, memberData.error);
    return NextResponse.json(
      { message: 'Error deleting workspace member' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

/**
 * Revokes a Polar seat from a workspace member
 * Best-effort: logs warning if seat not found but doesn't throw
 */
async function revokeSeatFromMember(
  polar: Polar,
  supabase: TypedSupabaseClient,
  wsId: string,
  userId: string
): Promise<void> {
  // Fetch active subscription
  const { data: subscription } = await supabase
    .from('workspace_subscriptions')
    .select(
      `
      polar_subscription_id,
      workspace_subscription_products (
        pricing_model
      )
    `
    )
    .eq('ws_id', wsId)
    .eq('status', 'active')
    .single();

  // No active subscription or not seat-based
  if (
    !subscription ||
    !subscription.workspace_subscription_products ||
    subscription.workspace_subscription_products.pricing_model !== 'seat_based'
  ) {
    return; // Skip for non-seat-based subscriptions
  }

  try {
    // List all seats for this subscription
    const seatsList = await polar.customerSeats.listSeats({
      subscriptionId: subscription.polar_subscription_id!,
    });

    // Find the seat for this user (match by customerId from personal customer)
    const userSeat = seatsList.seats.find((seat) => {
      // Match by the personal customer's externalId
      return seat.customerId === userId;
    });

    if (!userSeat) {
      console.warn(
        `No Polar seat found for user ${userId} in workspace ${wsId} - may have already been revoked`
      );
      return;
    }

    // Revoke the seat
    await polar.customerSeats.revokeSeat({
      seatId: userSeat.id,
    });

    console.log(
      `Revoked Polar seat ${userSeat.id} from user ${userId} in workspace ${wsId}`
    );
  } catch (error) {
    // Best-effort: log error but don't throw
    console.error(`Failed to revoke Polar seat for user ${userId}:`, error);
  }
}
