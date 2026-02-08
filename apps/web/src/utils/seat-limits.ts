import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';

/**
 * Seat status information for a workspace subscription
 */
export interface SeatStatus {
  /** Whether the subscription uses seat-based pricing */
  isSeatBased: boolean;
  /** Number of purchased seats */
  seatCount: number;
  /** Current number of workspace members */
  memberCount: number;
  /** Available seats (seatCount - memberCount) */
  availableSeats: number;
  /** Whether a new member can be added */
  canAddMember: boolean;
  /** Price per seat in cents (if seat-based) */
  pricePerSeat: number | null;
}

/**
 * Result of seat limit enforcement check
 */
export interface SeatLimitResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Error message if not allowed */
  message?: string;
  /** Current seat status */
  status?: SeatStatus;
}

/**
 * Get the seat status for a workspace
 * @param supabase - Supabase client instance
 * @param wsId - Workspace ID
 * @returns Current seat status including counts and availability
 */
export async function getSeatStatus(
  supabase: TypedSupabaseClient,
  wsId: string
): Promise<SeatStatus> {
  // Get active subscription info
  const { data: subscription, error } = await supabase
    .from('workspace_subscriptions')
    .select(
      'seat_count, workspace_subscription_products(pricing_model, price_per_seat)'
    )
    .eq('ws_id', wsId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching seat status:', error.message);
    return {
      isSeatBased: true, // Be conservative on error
      seatCount: 0,
      memberCount: 0,
      availableSeats: 0,
      canAddMember: false,
      pricePerSeat: null,
    };
  }

  const product = subscription?.workspace_subscription_products;

  // If not seat-based, no limit applies
  if (!subscription || product?.pricing_model !== 'seat_based') {
    return {
      isSeatBased: false,
      seatCount: Infinity,
      memberCount: 0,
      availableSeats: Infinity,
      canAddMember: true,
      pricePerSeat: null,
    };
  }

  // Count current workspace members
  const { count: memberCount } = await supabase
    .from('workspace_members')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  const seatCount = subscription.seat_count ?? 1;
  const currentMembers = memberCount ?? 0;
  const availableSeats = Math.max(0, seatCount - currentMembers);

  return {
    isSeatBased: true,
    seatCount,
    memberCount: currentMembers,
    availableSeats,
    canAddMember: availableSeats > 0,
    pricePerSeat: product?.price_per_seat,
  };
}

/**
 * Enforce seat limit before adding a member to a workspace
 * @param supabase - Supabase client instance
 * @param wsId - Workspace ID
 * @returns Result indicating if action is allowed with optional error message
 */
export async function enforceSeatLimit(
  supabase: TypedSupabaseClient,
  wsId: string
): Promise<SeatLimitResult> {
  const status = await getSeatStatus(supabase, wsId);

  if (!status.isSeatBased) {
    return { allowed: true, status };
  }

  if (!status.canAddMember) {
    return {
      allowed: false,
      message: `Seat limit reached (${status.memberCount}/${status.seatCount}). Please purchase more seats to add members.`,
      status,
    };
  }

  return { allowed: true, status };
}

/**
 * Check if a workspace has room for new invitations
 * Takes into account both current members and pending invitations
 * @param supabase - Supabase client instance
 * @param wsId - Workspace ID
 * @returns Result indicating if invitations are allowed
 */
export async function canCreateInvitation(
  supabase: TypedSupabaseClient,
  wsId: string
): Promise<SeatLimitResult> {
  const status = await getSeatStatus(supabase, wsId);

  if (!status.isSeatBased) {
    return { allowed: true, status };
  }

  // Count pending invitations
  const [{ count: workspaceInvitesCount }, { count: emailInvitesCount }] =
    await Promise.all([
      supabase
        .from('workspace_invites')
        .select('*', { count: 'exact', head: true })
        .eq('ws_id', wsId),
      supabase
        .from('workspace_email_invites')
        .select('*', { count: 'exact', head: true })
        .eq('ws_id', wsId),
    ]);

  const totalPending = (workspaceInvitesCount ?? 0) + (emailInvitesCount ?? 0);
  const effectiveUsed = status.memberCount + totalPending;
  const effectiveAvailable = Math.max(0, status.seatCount - effectiveUsed);

  if (effectiveAvailable === 0) {
    return {
      allowed: false,
      message: `No seats available for new invitations. Current: ${status.memberCount} members, ${totalPending} pending. Total seats: ${status.seatCount}.`,
      status: {
        ...status,
        availableSeats: effectiveAvailable,
        canAddMember: false,
      },
    };
  }

  return {
    allowed: true,
    status: {
      ...status,
      availableSeats: effectiveAvailable,
    },
  };
}

/**
 * Calculate the cost of adding additional seats
 * @param currentPricePerSeat - Price per seat in cents
 * @param additionalSeats - Number of seats to add
 * @returns Total cost in cents
 */
export function calculateSeatCost(
  currentPricePerSeat: number,
  additionalSeats: number
): number {
  return currentPricePerSeat * additionalSeats;
}
