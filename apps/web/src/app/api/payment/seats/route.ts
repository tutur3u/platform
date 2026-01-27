import { createPolarClient } from '@tuturuuu/payment/polar/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { getSeatStatus } from '@/utils/seat-limits';

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

    const seatStatus = await getSeatStatus(supabase, wsId);
    return NextResponse.json(seatStatus);
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
 * Purchase additional seats for a workspace subscription
 */
export async function POST(req: Request) {
  try {
    const { wsId, additionalSeats } = await req.json();

    if (!wsId || !additionalSeats || additionalSeats < 1) {
      return NextResponse.json(
        { error: 'Missing required fields: wsId and additionalSeats (min 1)' },
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
        { error: 'Only the workspace owner can purchase seats' },
        { status: 403 }
      );
    }

    // Get current seat-based subscription
    const { data: subscription } = await sbAdmin
      .from('workspace_subscriptions')
      .select('*')
      .eq('ws_id', wsId)
      .eq('status', 'active')
      .eq('pricing_model', 'seat_based')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription) {
      return NextResponse.json(
        { error: 'No active seat-based subscription found' },
        { status: 400 }
      );
    }

    const previousSeats = subscription.seat_count ?? 1;
    const newSeatCount = previousSeats + additionalSeats;

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
      // Note: Polar was already updated, so seats are actually purchased
      // The webhook should sync this eventually
    }

    return NextResponse.json({
      success: true,
      previousSeats,
      newSeats: newSeatCount,
      additionalSeats,
      pricePerSeat: subscription.price_per_seat,
    });
  } catch (error) {
    console.error('Error purchasing seats:', error);
    return NextResponse.json(
      { error: 'Failed to purchase seats' },
      { status: 500 }
    );
  }
}
