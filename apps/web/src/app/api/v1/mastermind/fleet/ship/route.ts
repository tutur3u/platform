import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isFleetOwner,
  MASTERMIND_FLEET_SESSIONS,
} from '@/lib/mastermind/fleet/auth';
import {
  FLEET_NO_STORE,
  fleetError,
  fleetStore,
} from '@/lib/mastermind/fleet/http';
import {
  SHIP_SNAPSHOT_KEY,
  shipSnapshotSchema,
} from '@/lib/mastermind/ship/contract';

/**
 * Same per-colo window as the fleet snapshot: one store read per colo. A
 * `?fresh=1` read (the one after Check now) skips it and replaces the cached
 * copy, so later polls in that colo see the new snapshot.
 */
const SHIP_READ_CACHE_MS = 5000;

/** Owner read of the ship snapshot the Cron Control collector writes. */
export const GET = withSessionAuth(
  async (request, { user }) => {
    if (!(await isFleetOwner(user))) return fleetError('forbidden', 403);
    const store = await fleetStore();
    if (!store) return fleetError('unavailable', 503);

    let raw: string | null;
    try {
      const fresh = new URL(request.url).searchParams.get('fresh') === '1';
      raw = await store.get(SHIP_SNAPSHOT_KEY, {
        cacheMs: SHIP_READ_CACHE_MS,
        refresh: fresh,
      });
    } catch {
      return fleetError('unavailable', 503);
    }
    if (!raw) return fleetError('not_collected', 404);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return fleetError('invalid_snapshot', 502);
    }
    const parsed = shipSnapshotSchema.safeParse(json);
    if (!parsed.success) return fleetError('invalid_snapshot', 502);
    return NextResponse.json(
      { snapshot: parsed.data, servedAt: new Date().toISOString() },
      { headers: FLEET_NO_STORE }
    );
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 60 },
    ...MASTERMIND_FLEET_SESSIONS,
  }
);
