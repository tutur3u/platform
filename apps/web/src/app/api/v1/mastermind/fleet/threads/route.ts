import {
  BRIDGE_NO_PROJECT,
  bridgeThreadStates,
} from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { MASTERMIND_FLEET_SESSIONS } from '@/lib/mastermind/fleet/auth';
import { readFromMachine } from '@/lib/mastermind/fleet/bridge-rpc';
import {
  FLEET_NO_STORE,
  fleetError,
  fleetStore,
} from '@/lib/mastermind/fleet/http';
import {
  ENVIRONMENT_ID,
  fleetReadError,
  MACHINE_ID,
  PROJECT_ID,
  queryInt,
  readSeen,
  refuseFleetRead,
  seenKey,
} from '@/lib/mastermind/fleet/thread-reads';

/**
 * Owner read of one page of threads on a fleet machine (or, with
 * `environmentId`, on a machine linked to it), newest first, with an
 * optional title search, one project (`projectId`, or `none` for threads in
 * no project) and one state. `include=ownerReply` adds when the owner last
 * wrote in each thread of the bridge machine itself. The list is fetched from
 * the machine on demand and is not stored anywhere on the way; a machine that
 * is not connected answers 503 `machine_offline`. Each thread carries how
 * many of its items the owner has seen, when known.
 */
export const GET = withSessionAuth(
  async (request, { user, supabase }) => {
    const refusal = await refuseFleetRead(request, { user, supabase });
    if (refusal) return refusal;
    const query = new URL(request.url).searchParams;
    const machineId = query.get('machineId') ?? '';
    const environmentId = query.get('environmentId') ?? undefined;
    const search = query.get('q')?.trim() || undefined;
    const cursor = queryInt(query.get('cursor'), 100_000);
    const limit = queryInt(query.get('limit'), 50);
    const projectId = query.get('projectId') ?? undefined;
    const state = (query.get('state') ?? undefined) as
      | (typeof bridgeThreadStates)[number]
      | undefined;
    const include = query.get('include');
    if (
      !MACHINE_ID.test(machineId) ||
      (environmentId !== undefined && !ENVIRONMENT_ID.test(environmentId)) ||
      (search !== undefined && search.length > 100) ||
      cursor === null ||
      limit === null ||
      limit === 0 ||
      (projectId !== undefined && !PROJECT_ID.test(projectId)) ||
      (state !== undefined && !bridgeThreadStates.includes(state)) ||
      (include !== null && include !== 'ownerReply')
    )
      return fleetError('invalid_query', 422);
    // A linked machine is listed through T3, which has no such filter.
    if (environmentId && projectId === BRIDGE_NO_PROJECT)
      return fleetError('unsupported_for_linked_machine', 422);

    const read = await readFromMachine('threads', machineId, {
      ...(environmentId ? { environmentId } : {}),
      ...(search ? { query: search } : {}),
      ...(cursor === undefined ? {} : { cursor }),
      ...(limit === undefined ? {} : { limit }),
      ...(projectId ? { projectId } : {}),
      ...(state ? { state } : {}),
      ...(include && !environmentId ? { ownerReply: true } : {}),
    });
    if (!read.ok) return fleetReadError(read.error);

    // Read markers are a convenience: without the store the list still stands.
    const store = await fleetStore();
    const seen = store
      ? await readSeen(store, user.id.toLowerCase()).catch(() => ({}))
      : {};
    return NextResponse.json(
      {
        machineId,
        ...(environmentId ? { environmentId } : {}),
        threads: read.data.threads.map((thread) => {
          const count = (seen as Record<string, number>)[
            seenKey(machineId, environmentId, thread.threadId)
          ];
          return {
            ...thread,
            ...(count === undefined ? {} : { seenItemCount: count }),
          };
        }),
        nextCursor: read.data.nextCursor,
        total: read.data.total,
      },
      { headers: FLEET_NO_STORE }
    );
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 60 },
    ...MASTERMIND_FLEET_SESSIONS,
  }
);
