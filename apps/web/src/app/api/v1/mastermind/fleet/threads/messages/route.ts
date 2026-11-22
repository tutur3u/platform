import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { MASTERMIND_FLEET_SESSIONS } from '@/lib/mastermind/fleet/auth';
import { readFromMachine } from '@/lib/mastermind/fleet/bridge-rpc';
import { FLEET_NO_STORE, fleetError } from '@/lib/mastermind/fleet/http';
import {
  ENVIRONMENT_ID,
  fleetReadError,
  MACHINE_ID,
  queryInt,
  refuseFleetRead,
  THREAD_ID,
} from '@/lib/mastermind/fleet/thread-reads';

/**
 * Owner read of one page of a thread's history, newest messages last;
 * `before` pages back from `earlierPosition`. The machine returns user and
 * assistant messages only, with credentials redacted and each message
 * capped, and the page is not stored anywhere on the way.
 */
export const GET = withSessionAuth(
  async (request, { user, supabase }) => {
    const refusal = await refuseFleetRead(request, { user, supabase });
    if (refusal) return refusal;
    const query = new URL(request.url).searchParams;
    const machineId = query.get('machineId') ?? '';
    const environmentId = query.get('environmentId') ?? undefined;
    const threadId = query.get('threadId') ?? '';
    const before = queryInt(query.get('before'), 100_000_000);
    const limit = queryInt(query.get('limit'), 30);
    if (
      !MACHINE_ID.test(machineId) ||
      !THREAD_ID.test(threadId) ||
      (environmentId !== undefined && !ENVIRONMENT_ID.test(environmentId)) ||
      before === null ||
      limit === null ||
      limit === 0
    )
      return fleetError('invalid_query', 422);

    const read = await readFromMachine('transcript', machineId, {
      threadId,
      ...(environmentId ? { environmentId } : {}),
      ...(before === undefined ? {} : { before }),
      ...(limit === undefined ? {} : { limit }),
    });
    if (!read.ok) return fleetReadError(read.error);
    return NextResponse.json(
      {
        machineId,
        ...(environmentId ? { environmentId } : {}),
        ...read.data,
      },
      { headers: FLEET_NO_STORE }
    );
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 60 },
    ...MASTERMIND_FLEET_SESSIONS,
  }
);
