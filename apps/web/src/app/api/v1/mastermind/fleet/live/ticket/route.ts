import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isFleetOwner,
  MASTERMIND_FLEET_SESSIONS,
} from '@/lib/mastermind/fleet/auth';
import {
  bridgeFailure,
  fleetBridge,
  ownerLiveLease,
} from '@/lib/mastermind/fleet/bridge';
import { FLEET_NO_STORE, fleetError } from '@/lib/mastermind/fleet/http';

/**
 * Owner: a single-use, 60-second ticket for a listen-only bridge socket that
 * pushes reply receipts, change notices and machine presence. The socket
 * accepts no input, so it grants nothing beyond what the owner can read.
 */
export const POST = withSessionAuth(
  async (request, { supabase, user }) => {
    if (!(await isFleetOwner(user))) return fleetError('forbidden', 403);
    const lease = await ownerLiveLease(request, { supabase, userId: user.id });
    if (lease.status === 'unavailable') return fleetError('unavailable', 503);
    if (lease.status !== 'allowed') return fleetError('mfa_required', 403);
    const bridge = fleetBridge();
    if (!bridge) return fleetError('unavailable', 503);
    try {
      const { ticket, expiresAt } = await bridge.ticket({
        role: 'owner',
        ownerId: user.id,
        leaseExpiresAt: lease.leaseExpiresAt,
      });
      return NextResponse.json(
        {
          url: bridge.socketUrl,
          ticket,
          expiresAt: new Date(expiresAt).toISOString(),
        },
        { headers: FLEET_NO_STORE }
      );
    } catch (error) {
      return bridgeFailure(error);
    }
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 12 },
    ...MASTERMIND_FLEET_SESSIONS,
    stepUpExempt: (user) => isFleetOwner(user),
  }
);
