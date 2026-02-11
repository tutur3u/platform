import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { SEAT_ACTIVE_STATUSES } from './subscription-constants';

/**
 * Ensures a personal Polar customer exists for a user
 * Personal customers use externalId = userId (not workspace_${wsId})
 */
export async function ensurePersonalPolarCustomer(
  polar: Polar,
  supabase: TypedSupabaseClient,
  userId: string
) {
  try {
    // Try to get existing personal customer by externalId = userId
    const existingCustomer = await polar.customers.getExternal({
      externalId: userId,
    });

    if (existingCustomer) {
      return existingCustomer;
    }
  } catch (_error) {
    // Customer doesn't exist - create it
    console.log(
      `Personal Polar customer not found for user ${userId}, creating...`
    );
  }

  // Fetch user email from user_private_details
  const { data: userPrivate } = await supabase
    .from('user_private_details')
    .select('email')
    .eq('id', userId)
    .single();

  if (!userPrivate?.email) {
    throw new Error(`User email not found for userId: ${userId}`);
  }

  // Fetch user display name
  const { data: userData } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .single();

  // Create personal Polar customer
  const customer = await polar.customers.create({
    externalId: userId,
    email: userPrivate.email,
    name: userData?.display_name || userPrivate.email.split('@')[0],
  });

  console.log(
    `Created personal Polar customer for user ${userId}: ${customer.id}`
  );

  return customer;
}

/**
 * Result type for seat assignment operations
 */
export type SeatAssignmentResult =
  | { required: false } // Not seat-based subscription
  | { required: true; success: true; seatId: string }
  | { required: true; success: false; error: string };

/**
 * Assigns a Polar seat to a workspace member
 * Only applies to seat-based subscriptions
 * Uses immediateClaim: true to skip invitation email
 */
export async function assignSeatToMember(
  polar: Polar,
  supabase: TypedSupabaseClient,
  wsId: string,
  userId: string
): Promise<SeatAssignmentResult> {
  // Fetch active subscription with its product (1:1 relationship)
  const { data: subscription } = await supabase
    .from('workspace_subscriptions')
    .select(
      'polar_subscription_id, workspace_subscription_products!inner(pricing_model)'
    )
    .eq('ws_id', wsId)
    .in('status', SEAT_ACTIVE_STATUSES)
    .single();

  // No active subscription or not seat-based
  if (
    !subscription ||
    subscription.workspace_subscription_products.pricing_model !== 'seat_based'
  ) {
    return { required: false };
  }

  try {
    // Ensure the user has a personal Polar customer
    await ensurePersonalPolarCustomer(polar, supabase, userId);

    // Assign seat with immediate claim
    const seat = await polar.customerSeats.assignSeat({
      subscriptionId: subscription.polar_subscription_id!,
      externalCustomerId: userId,
      immediateClaim: true,
    });

    console.log(
      `Assigned Polar seat ${seat.id} to user ${userId} in workspace ${wsId}`
    );

    return { required: true, success: true, seatId: seat.id };
  } catch (error) {
    console.error(`Failed to assign Polar seat:`, error);
    return {
      required: true,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Revokes a Polar seat from a workspace member
 * Best-effort: logs warning if seat not found but doesn't throw
 */
export async function revokeSeatFromMember(
  polar: Polar,
  supabase: TypedSupabaseClient,
  wsId: string,
  userId: string
): Promise<void> {
  // Fetch active subscription with its product (1:1 relationship)
  const { data: subscription } = await supabase
    .from('workspace_subscriptions')
    .select(
      'polar_subscription_id, workspace_subscription_products!inner(pricing_model)'
    )
    .eq('ws_id', wsId)
    .in('status', SEAT_ACTIVE_STATUSES)
    .single();

  // No active subscription or not seat-based
  if (
    !subscription ||
    subscription.workspace_subscription_products.pricing_model !== 'seat_based'
  ) {
    return; // Skip for non-seat-based subscriptions
  }

  try {
    // Get the user's personal Polar customer to find their internal ID
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

    // Find the seat for this user (match by Polar's internal customerId)
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
    console.error(`Failed to revoke Polar seat:`, error);
  }
}

/**
 * Assigns seats to all current workspace members
 * Used during plan upgrade to seat-based subscription
 * Partial failures are logged but don't block overall operation
 */
export async function assignSeatsToAllMembers(
  polar: Polar,
  supabase: TypedSupabaseClient,
  wsId: string,
  polarSubscriptionId: string
): Promise<void> {
  // Get all workspace members
  const { data: members } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId);

  if (!members || members.length === 0) {
    console.log(`No members to assign seats for workspace ${wsId}`);
    return;
  }

  console.log(
    `Assigning seats to ${members.length} members in workspace ${wsId}`
  );

  let successCount = 0;
  let failureCount = 0;

  // Assign seats to each member
  for (const member of members) {
    try {
      await ensurePersonalPolarCustomer(polar, supabase, member.user_id);

      await polar.customerSeats.assignSeat({
        subscriptionId: polarSubscriptionId,
        externalCustomerId: member.user_id,
        immediateClaim: true,
      });

      successCount++;
    } catch (error) {
      failureCount++;
      console.error(`Failed to assign seat to user ${member.user_id}:`, error);
    }
  }

  console.log(
    `Seat assignment complete for workspace ${wsId}: ${successCount} success, ${failureCount} failures`
  );
}
