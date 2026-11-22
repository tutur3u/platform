import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isFleetOwner,
  MASTERMIND_FLEET_SESSIONS,
} from '@/lib/mastermind/fleet/auth';
import {
  bridgeFailure,
  fleetBridge,
  replyView,
} from '@/lib/mastermind/fleet/bridge';
import { FLEET_NO_STORE, fleetError } from '@/lib/mastermind/fleet/http';

const REPLY_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Owner read of one reply's delivery state: sent, delivered, failed or expired. */
export const GET = withSessionAuth<{ replyId: string }>(
  async (_request, { user }, { replyId }) => {
    if (!REPLY_ID.test(replyId)) return fleetError('not_found', 404);
    if (!(await isFleetOwner(user))) return fleetError('forbidden', 403);
    const bridge = fleetBridge();
    if (!bridge) return fleetError('unavailable', 503);
    try {
      const receipt = await bridge.receipt(replyId);
      return receipt
        ? NextResponse.json(replyView(receipt), { headers: FLEET_NO_STORE })
        : fleetError('not_found', 404);
    } catch (error) {
      return bridgeFailure(error);
    }
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 120 },
    ...MASTERMIND_FLEET_SESSIONS,
  }
);
