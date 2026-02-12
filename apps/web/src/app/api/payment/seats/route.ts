import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { WorkspaceSubscriptionProduct } from '@tuturuuu/types/db';
import { NextResponse } from 'next/server';
import { SEAT_ACTIVE_STATUSES } from '@/utils/subscription-constants';

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

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Verify user has access to the workspace
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: 'Not a member of this workspace' },
        { status: 403 }
      );
    }

    // Get subscription and member count
    const { data: subscription } = await sbAdmin
      .from('workspace_subscriptions')
      .select(
        '*, workspace_subscription_products(pricing_model, price_per_seat)'
      )
      .eq('ws_id', wsId)
      .in('status', SEAT_ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: memberCount } = await sbAdmin
      .from('workspace_members')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId);

    const product = subscription?.workspace_subscription_products;

    const isSeatBased = product?.pricing_model === 'seat_based';
    const currentMembers = memberCount ?? 0;

    // Use -1 to represent unlimited seats in the JSON response,
    // since JSON.stringify(Infinity) produces null.
    const seatCount = isSeatBased ? (subscription?.seat_count ?? 1) : -1;
    const availableSeats = isSeatBased
      ? Math.max(0, seatCount - currentMembers)
      : -1;

    return NextResponse.json({
      isSeatBased,
      seatCount,
      memberCount: currentMembers,
      availableSeats,
      canAddMember: !isSeatBased || availableSeats > 0,
      pricePerSeat: product?.price_per_seat ?? null,
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

    if (!wsId || !newSeatCount || newSeatCount < 1) {
      return NextResponse.json(
        { error: 'Missing required fields: wsId and newSeatCount (min 1)' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Verify user is authenticated and has permission
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Get current seat-based subscription with product limits
    // pricing_model lives on workspace_subscription_products, not workspace_subscriptions
    const { data: subscription } = await sbAdmin
      .from('workspace_subscriptions')
      .select(
        '*, workspace_subscription_products!inner(pricing_model, max_seats, min_seats, price_per_seat)'
      )
      .eq('ws_id', wsId)
      .in('status', SEAT_ACTIVE_STATUSES)
      .eq('workspace_subscription_products.pricing_model', 'seat_based')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription) {
      return NextResponse.json(
        { error: 'No active seat-based subscription found' },
        { status: 400 }
      );
    }

    // Get current member count
    const { count: memberCount } = await sbAdmin
      .from('workspace_members')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId);

    const currentMembers = memberCount ?? 0;

    // Validate new seat count against constraints
    const product = subscription.workspace_subscription_products as Pick<
      WorkspaceSubscriptionProduct,
      'pricing_model' | 'min_seats' | 'max_seats' | 'price_per_seat'
    > | null;
    const minSeats = Math.max(1, currentMembers, product?.min_seats ?? 0);
    const maxSeats = product?.max_seats ?? Infinity;

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
