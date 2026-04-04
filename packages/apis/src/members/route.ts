import type { Polar } from '@tuturuuu/payment/polar';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { wsId: id } = await params;
  const supabase = await createClient(req);

  const wsId = await normalizeWorkspaceId(id, supabase);

  if (!wsId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

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
  const normalizedUserEmail = userEmail?.trim() || null;

  const supabase = await createClient(req);
  const resolvedWsId = await normalizeWorkspaceId(wsId, supabase);

  if (!resolvedWsId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Revoke Polar seat BEFORE deleting member (best-effort)
  if (userId) {
    const polar = createPolarClient();
    const sbAdmin = await createAdminClient();
    await revokeSeatFromMember(polar, sbAdmin, resolvedWsId, userId);
  }

  let inviteUserIds: string[] = [];
  if (normalizedUserEmail) {
    const { data: matchingInvites, error: matchingInvitesError } =
      await supabase
        .from('workspace_members_and_invites')
        .select('id')
        .eq('ws_id', resolvedWsId)
        .eq('email', normalizedUserEmail);

    if (matchingInvitesError) {
      console.error('Error resolving invite identities:', matchingInvitesError);
      return NextResponse.json(
        { message: 'Error deleting workspace member' },
        { status: 500 }
      );
    }

    inviteUserIds = (matchingInvites ?? [])
      .map((row) => row.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }

  const inviteQuery = userId
    ? supabase
        .from('workspace_invites')
        .delete()
        .eq('ws_id', resolvedWsId)
        .eq('user_id', userId)
    : inviteUserIds.length > 0
    ? supabase
        .from('workspace_invites')
        .delete()
        .eq('ws_id', resolvedWsId)
        .in('user_id', inviteUserIds)
    : { error: undefined };

  const emailInviteQuery = normalizedUserEmail
    ? supabase
        .from('workspace_email_invites')
        .delete()
        .eq('ws_id', resolvedWsId)
        .eq('email', normalizedUserEmail)
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

  // After successful removal, check if workspace is now orphaned
  const workspaceDeleted = userId
    ? await cleanupOrphanedWorkspace(resolvedWsId)
    : false;

  return NextResponse.json({
    message: 'success',
    workspace_deleted: workspaceDeleted,
  });
}

/**
 * Checks if a workspace has zero remaining members after a removal.
 * If orphaned (and not personal/system), cancels any active Polar subscription
 * and deletes the workspace. Returns true if the workspace was deleted.
 */
async function cleanupOrphanedWorkspace(wsId: string): Promise<boolean> {
  if (wsId === ROOT_WORKSPACE_ID) return false;

  try {
    const sbAdmin = await createAdminClient();

    // Skip personal workspaces — they should never be auto-deleted
    const { data: workspaceData } = await sbAdmin
      .from('workspaces')
      .select('personal')
      .eq('id', wsId)
      .single();

    if (!workspaceData || workspaceData.personal) return false;

    // Count remaining members (admin client needed since user just left)
    const { count, error: countError } = await sbAdmin
      .from('workspace_members')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId);

    if (countError) {
      console.error('Error counting workspace members:', countError);
      return false;
    }

    if ((count ?? 0) > 0) return false;

    // Workspace is orphaned — cancel active subscription (best-effort)
    try {
      const { data: subscription } = await sbAdmin
        .from('workspace_subscriptions')
        .select('polar_subscription_id')
        .eq('ws_id', wsId)
        .neq('status', 'canceled')
        .maybeSingle();

      if (subscription?.polar_subscription_id) {
        const polar = createPolarClient();
        await polar.subscriptions.revoke({
          id: subscription.polar_subscription_id,
        });
        console.log(
          `Revoked Polar subscription ${subscription.polar_subscription_id} for orphaned workspace ${wsId}`
        );
      }
    } catch (subError) {
      console.error(
        `Failed to revoke subscription for orphaned workspace ${wsId}:`,
        subError
      );
      // Continue — Polar webhook reconciliation will catch this
    }

    // Delete the workspace (cascades to all related tables)
    const { error: deleteError } = await sbAdmin
      .from('workspaces')
      .delete()
      .eq('id', wsId);

    if (deleteError) {
      console.error(
        `Failed to delete orphaned workspace ${wsId}:`,
        deleteError
      );
      return false;
    }

    console.log(`Deleted orphaned workspace ${wsId}`);
    return true;
  } catch (error) {
    console.error(
      `Error during orphaned workspace cleanup for ${wsId}:`,
      error
    );
    return false;
  }
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
    !subscription?.workspace_subscription_products ||
    subscription.workspace_subscription_products.pricing_model !== 'seat_based'
  ) {
    return; // Skip for non-seat-based subscriptions
  }

  try {
    const customer = await polar.customers.getExternal({
      externalId: userId,
    });

    if (!customer) {
      console.warn(
        `No Polar customer found for user ${userId} - cannot revoke seat`
      );
      return;
    }

    // List all seats for this subscription
    const seatsList = await polar.customerSeats.listSeats({
      subscriptionId: subscription.polar_subscription_id!,
    });

    // Match seats using Polar's internal customer id, not the app user id.
    const userSeat = seatsList.seats.find((seat) => {
      return seat.customerId === customer.id;
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
