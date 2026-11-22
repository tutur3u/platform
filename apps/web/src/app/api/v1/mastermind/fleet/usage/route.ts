import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isFleetOwner,
  MASTERMIND_FLEET_SESSIONS,
} from '@/lib/mastermind/fleet/auth';
import {
  authorizeFleetPublisher,
  FLEET_NO_STORE,
  fleetError,
  fleetStore,
} from '@/lib/mastermind/fleet/http';
import {
  FLEET_USAGE_MAX_BYTES,
  fleetUsageSnapshotSchema,
} from '@/lib/mastermind/fleet/usage-contract';
import {
  readFleetUsage,
  UsageSnapshotTimeError,
  writeFleetUsage,
} from '@/lib/mastermind/fleet/usage-store';

export const GET = withSessionAuth(
  async (_request, { user }) => {
    if (!(await isFleetOwner(user))) return fleetError('forbidden', 403);
    const store = await fleetStore();
    if (!store) return fleetError('unavailable', 503);

    try {
      const usage = await readFleetUsage(store);
      if (!usage) return fleetError('not_published', 404);
      return NextResponse.json(usage, { headers: FLEET_NO_STORE });
    } catch {
      return fleetError('unavailable', 503);
    }
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 60 },
    ...MASTERMIND_FLEET_SESSIONS,
  }
);

export async function PUT(request: Request) {
  const auth = await authorizeFleetPublisher(request, FLEET_USAGE_MAX_BYTES);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = JSON.parse(auth.body);
  } catch {
    return fleetError('invalid_json', 400);
  }
  const parsed = fleetUsageSnapshotSchema.safeParse(json);
  if (!parsed.success) return fleetError('invalid_usage', 422);

  try {
    const { receivedAt } = await writeFleetUsage(auth.store, parsed.data);
    return NextResponse.json(
      { accepted: true, receivedAt },
      { headers: FLEET_NO_STORE }
    );
  } catch (error) {
    if (error instanceof UsageSnapshotTimeError) {
      return fleetError('invalid_snapshot_time', 409);
    }
    return fleetError('unavailable', 503);
  }
}
