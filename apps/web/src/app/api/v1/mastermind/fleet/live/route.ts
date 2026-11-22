import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isFleetOwner,
  MASTERMIND_FLEET_SESSIONS,
} from '@/lib/mastermind/fleet/auth';
import { bridgeFailure, fleetBridge } from '@/lib/mastermind/fleet/bridge';
import { FLEET_NO_STORE, fleetError } from '@/lib/mastermind/fleet/http';

const iso = (ms: number | undefined) =>
  ms === undefined ? undefined : new Date(ms).toISOString();

/**
 * Owner read of the push channel: which machines hold a bridge socket and
 * the newest change notice per topic. A notice carries a topic and a
 * revision only; the data itself stays behind its own owner route.
 */
export const GET = withSessionAuth(
  async (_request, { user }) => {
    if (!(await isFleetOwner(user))) return fleetError('forbidden', 403);
    const bridge = fleetBridge();
    if (!bridge) return fleetError('unavailable', 503);
    try {
      const live = await bridge.live();
      return NextResponse.json(
        {
          machines: live.machines.map((machine) => ({
            machineId: machine.machineId,
            connected: machine.connected,
            connectedAt: iso(machine.connectedAt),
            lastSeenAt: iso(machine.lastSeenAt),
            disconnectedAt: iso(machine.disconnectedAt),
          })),
          pokes: live.pokes,
        },
        { headers: FLEET_NO_STORE }
      );
    } catch (error) {
      return bridgeFailure(error);
    }
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 120 },
    ...MASTERMIND_FLEET_SESSIONS,
  }
);
