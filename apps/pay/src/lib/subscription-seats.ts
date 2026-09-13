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
  if (!['seat_based', 'fixed', 'free'].includes(currentPricingModel ?? ''))
    return {
      ok: false,
      status: 503,
      error: 'Current pricing model could not be verified',
    };
  const currentSeats =
    currentPricingModel === 'seat_based' ? subscription.seat_count : 0;
  if (currentPricingModel === 'seat_based' && !validCheckoutSeats(currentSeats))
    return {
      ok: false,
      status: 503,
      error: 'Current purchased seats could not be verified',
    };
  const requiredSeats = await getRequiredWorkspaceSeats(
    admin,
    subscription.ws_id
  );
  if (requiredSeats === null)
    return {
      ok: false,
      status: 503,
      error: 'Workspace seat count could not be verified',
    };
  const seats = resolveSelfServeSeatCount({
    currentSeats,
    requiredSeats,
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

/** Pending invitations reserve capacity; checkout explicitly confirms its price. */
export async function getRequiredWorkspaceSeats(
  admin: Admin,
  wsId: string
): Promise<number | null> {
  const results = await Promise.all([
    admin
      .from('workspace_members')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId),
    admin
      .from('workspace_invites')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId),
    admin
      .from('workspace_email_invites')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId),
  ]);
  if (
    results.some(
      ({ count, error }) =>
        error || !Number.isSafeInteger(count) || (count ?? -1) < 0
    )
  )
    return null;
  if (!validCheckoutSeats(results[0]?.count ?? null)) return null;
  const seats = results.reduce((total, { count }) => total + (count ?? 0), 0);
  return validCheckoutSeats(seats) ? seats : null;
}
