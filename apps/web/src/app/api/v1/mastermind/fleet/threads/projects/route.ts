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
 * Owner read of the projects on a fleet machine that have live threads, the
 * one touched last first, each with its thread count per state, followed by
 * the same counts for threads in no project. At most 200 projects are
 * returned; `total` says how many there are. Counted on the machine on
 * demand and stored nowhere on the way. Only the bridge machine itself is
 * grouped: a linked machine answers 422 `unsupported_for_linked_machine`.
 */
export const GET = withSessionAuth(
  async (request, { appSessionToken, user, supabase }) => {
    const refusal = await refuseFleetRead(request, {
      appSessionToken,
      user,
      supabase,
    });
    if (refusal) return refusal;
    const query = new URL(request.url).searchParams;
    const machineId = query.get('machineId') ?? '';
    if (!MACHINE_ID.test(machineId)) return fleetError('invalid_query', 422);
    if (query.has('environmentId'))
      return fleetError('unsupported_for_linked_machine', 422);
    const read = await readFromMachine('projects', machineId, {});
    if (!read.ok) return fleetReadError(read.error);
    return NextResponse.json(
      { machineId, ...read.data },
      { headers: FLEET_NO_STORE }
    );
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 60 },
    ...MASTERMIND_FLEET_SESSIONS,
  }
);
