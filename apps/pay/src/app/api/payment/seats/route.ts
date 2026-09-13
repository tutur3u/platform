import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { getSeatStatus } from '@tuturuuu/payment-core/seat-limits';
import { validCheckoutSeats } from '@tuturuuu/payment-core/self-serve-products';
import { SEAT_ACTIVE_STATUSES } from '@tuturuuu/payment-core/subscription-constants';
import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import type { WorkspaceSubscriptionProduct } from '@tuturuuu/types/db';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

/**
 * Resolve the caller on a satellite.
 *
 * A session on pay.tuturuuu.com is normally an app-session JWT, and the
 * cookie-backed Supabase client is anonymous in that case — resolving (or
 * authorizing) through it alone silently rejects valid callers. Prefer the app
 * session and fall back to the Supabase cookie session.
 */
/**
 * GET /api/payment/seats?wsId=xxx
 * Get current seat status for a workspace
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const wsId = url.searchParams.get('wsId');

    if (!wsId) {
      return NextResponse.json(
        { error: 'Missing wsId parameter' },
        { status: 400 }
      );
    }

    // Verify user has access to the workspace
    const actor = await resolveSatelliteRequestActor(req, ['pay', 'platform']);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { admin: sbAdmin, user } = actor;

    // Authorize with the admin client filtered by the authenticated user id:
    // the cookie client is anonymous for app-session callers.
    const workspaceMember = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: sbAdmin,
    });

    if (workspaceMember.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!workspaceMember.ok) {
      return NextResponse.json(
        { error: 'Not a member of this workspace' },
        { status: 403 }
      );
    }

    const status = await getSeatStatus(sbAdmin, wsId);
    return NextResponse.json({
      ...status,
      seatCount: Number.isFinite(status.seatCount) ? status.seatCount : -1,
      availableSeats: Number.isFinite(status.availableSeats)
        ? status.availableSeats
        : -1,
    });
  } catch (error) {
    console.error('Error getting seat status:', error);
    return NextResponse.json(
      { error: 'Failed to get seat status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/payment/seats
 * Update subscription seat count for a workspace
 */
export async function POST(req: Request) {
  try {
    const { wsId, newSeatCount } = await req.json();

    if (
      typeof wsId !== 'string' ||
      !wsId ||
      !validCheckoutSeats(newSeatCount)
    ) {
      return NextResponse.json(
        {
          error: 'Provide wsId and an integer newSeatCount between 1 and 1000',
        },
        { status: 400 }
      );
    }

    // Verify user is authenticated and has permission
    const actor = await resolveSatelliteRequestActor(req, ['pay', 'platform']);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { admin: sbAdmin, user } = actor;

    // Check if user is the workspace creator (has billing permission)
    const { data: workspace } = await sbAdmin
      .from('workspaces')
      .select('creator_id')
      .eq('id', wsId)
      .single();

    if (!workspace || workspace.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the workspace owner can adjust seats' },
        { status: 403 }
      );
    }

    // Get current subscription, then resolve private product limits.
    const { data: subscription } = await sbAdmin
      .from('workspace_subscriptions')
      .select('*')
      .eq('ws_id', wsId)
      .in('status', SEAT_ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: product } = subscription?.product_id
      ? await sbAdmin
          .schema('private')
          .from('workspace_subscription_products')
          .select('pricing_model, max_seats, min_seats, price_per_seat')
          .eq('id', subscription.product_id)
          .maybeSingle()
      : { data: null };

    if (!subscription || product?.pricing_model !== 'seat_based') {
      return NextResponse.json(
        { error: 'No active seat-based subscription found' },
        { status: 400 }
      );
    }

    const { count: memberCount, error: memberError } = await sbAdmin
      .from('workspace_members')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId);
    if (
      memberError ||
      !Number.isSafeInteger(memberCount) ||
      memberCount === null ||
      memberCount < 0
    ) {
      return NextResponse.json(
        { error: 'Workspace member count could not be verified' },
        { status: 503 }
      );
    }
    if (newSeatCount < memberCount) {
      return NextResponse.json(
        { error: 'Remove members before reducing their paid seats' },
        { status: 400 }
      );
    }

    const currentMembers = memberCount;

    // Validate new seat count against constraints
    const seatProduct = product as Pick<
      WorkspaceSubscriptionProduct,
      'pricing_model' | 'min_seats' | 'max_seats' | 'price_per_seat'
    > | null;
    if (
      !seatProduct ||
      !Number.isSafeInteger(seatProduct.min_seats) ||
      (seatProduct.min_seats ?? 0) < 1 ||
      (seatProduct.max_seats !== null &&
        (!Number.isSafeInteger(seatProduct.max_seats) ||
          seatProduct.max_seats < (seatProduct.min_seats ?? 1)))
    ) {
      return NextResponse.json(
        { error: 'Product seat limits could not be verified' },
        { status: 503 }
      );
    }
    const minSeats = Math.max(1, currentMembers, seatProduct.min_seats ?? 1);
    const maxSeats = seatProduct?.max_seats ?? Infinity;

    if (newSeatCount < minSeats) {
      return NextResponse.json(
        {
          error: `Seat count cannot be less than the minimum required (${minSeats})`,
        },
        { status: 400 }
      );
    }

    if (newSeatCount > maxSeats) {
      return NextResponse.json(
        {
          error: `Seat count cannot exceed maximum (${maxSeats})`,
        },
        { status: 400 }
      );
    }

    const previousSeats = subscription.seat_count ?? 1;

    // Update subscription in Polar (prorated billing)
    const polar = createPolarClient();

    try {
      await polar.subscriptions.update({
        id: subscription.polar_subscription_id,
        subscriptionUpdate: {
          seats: newSeatCount,
          prorationBehavior: 'invoice',
        },
      });
    } catch (polarError) {
      console.error('Polar subscription update error:', polarError);
      return NextResponse.json(
        { error: 'Failed to update subscription with payment provider' },
        { status: 500 }
      );
    }

    // Update local record
    const { error: updateError } = await sbAdmin
      .from('workspace_subscriptions')
      .update({ seat_count: newSeatCount })
      .eq('id', subscription.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      // Polar was already updated — return a warning so the client knows
      // the billing provider has the new count but the local record is stale.
      // The webhook should eventually sync the local record.
      return NextResponse.json(
        {
          success: true,
          warning:
            'Billing updated but local record sync failed. It will be reconciled shortly.',
          previousSeats,
          newSeats: newSeatCount,
          seatChange: newSeatCount - previousSeats,
          pricePerSeat: product?.price_per_seat,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      previousSeats,
      newSeats: newSeatCount,
      seatChange: newSeatCount - previousSeats,
      pricePerSeat: product?.price_per_seat,
    });
  } catch (error) {
    console.error('Error updating seats:', error);
    return NextResponse.json(
      { error: 'Failed to update seats' },
      { status: 500 }
    );
  }
}
