import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { MASTERMIND_FLEET_SESSIONS } from '@/lib/mastermind/fleet/auth';
import { readFromMachine } from '@/lib/mastermind/fleet/bridge-rpc';
import { FLEET_NO_STORE, fleetError } from '@/lib/mastermind/fleet/http';
import {
  fleetReadError,
  MACHINE_ID,
  refuseFleetRead,
} from '@/lib/mastermind/fleet/thread-reads';

/**
 * Owner read of the machines whose threads are reachable through one bridge
 * machine: that machine itself, then every machine linked to it, each with
 * whether it answers now.
 */
export const GET = withSessionAuth(
  async (request, { user, supabase }) => {
    const refusal = await refuseFleetRead(request, { user, supabase });
    if (refusal) return refusal;
    const machineId = new URL(request.url).searchParams.get('machineId') ?? '';
    if (!MACHINE_ID.test(machineId)) return fleetError('invalid_query', 422);
    const read = await readFromMachine('machines', machineId, {});
    if (!read.ok) return fleetReadError(read.error);
    return NextResponse.json(
      { machineId, machines: read.data.machines },
      { headers: FLEET_NO_STORE }
    );
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 30 },
    ...MASTERMIND_FLEET_SESSIONS,
  }
);
