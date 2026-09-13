import {
  resolveSelfServeSeatCount,
  validCheckoutSeats,
} from '@tuturuuu/payment-core/self-serve-products';
import type { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';

type Admin = NonNullable<
  Awaited<ReturnType<typeof resolveSatelliteRequestActor>>
>['admin'];

export async function getSubscriptionTransitionSeats(
  admin: Admin,
  subscription: {
    ws_id: string;
    seat_count: number | null;
  },
  currentPricingModel: string | null,
  target: { min_seats: number | null; max_seats: number | null }
): Promise<
  { ok: true; seats: number } | { ok: false; status: number; error: string }
> {
  const currentSeats =
    currentPricingModel === 'seat_based' ? subscription.seat_count : 0;
  if (currentPricingModel === 'seat_based' && !validCheckoutSeats(currentSeats))
    return {
      ok: false,
      status: 503,
      error: 'Current purchased seats could not be verified',
    };
  const { count, error } = await admin
    .from('workspace_members')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', subscription.ws_id);
  if (error || !validCheckoutSeats(count))
    return {
      ok: false,
      status: 503,
      error: 'Workspace seat count could not be verified',
    };
  const seats = resolveSelfServeSeatCount({
    currentSeats,
    memberCount: count,
    minSeats: target.min_seats,
    maxSeats: target.max_seats,
  });
  return seats === null
    ? {
        ok: false,
        status: 400,
        error:
          'Workspace capacity does not satisfy the target plan seat limits',
      }
    : { ok: true, seats };
}
