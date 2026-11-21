import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isFleetOwner,
  MASTERMIND_APP_SESSION,
} from '@/lib/mastermind/fleet/auth';
import {
  FLEET_NO_STORE,
  fleetError,
  fleetStore,
  readCappedText,
} from '@/lib/mastermind/fleet/http';
import {
  ENVIRONMENT_ID,
  MACHINE_ID,
  markSeen,
  refuseFleetRead,
  seenKey,
  THREAD_ID,
} from '@/lib/mastermind/fleet/thread-reads';

const seenInputSchema = z
  .object({
    machineId: z.string().regex(MACHINE_ID),
    environmentId: z.string().regex(ENVIRONMENT_ID).optional(),
    threadId: z.string().regex(THREAD_ID),
    itemCount: z.number().int().min(0).max(100_000_000),
  })
  .strict();

/**
 * Owner: records how far a thread has been read, so the list can show what
 * is new. The marker only moves forward and holds a count, never content.
 */
export const POST = withSessionAuth(
  async (request, { user, supabase }) => {
    const refusal = await refuseFleetRead(request, { user, supabase });
    if (refusal) return refusal;
    const body = await readCappedText(request, 2048);
    if (body === null) return fleetError('payload_too_large', 413);
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return fleetError('invalid_json', 400);
    }
    const parsed = seenInputSchema.safeParse(json);
    if (!parsed.success) return fleetError('invalid_marker', 422);
    const store = await fleetStore();
    if (!store) return fleetError('unavailable', 503);
    try {
      const saved = await markSeen(
        store,
        user.id.toLowerCase(),
        seenKey(
          parsed.data.machineId,
          parsed.data.environmentId,
          parsed.data.threadId
        ),
        parsed.data.itemCount
      );
      return NextResponse.json({ saved }, { headers: FLEET_NO_STORE });
    } catch {
      return fleetError('unavailable', 503);
    }
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 120 },
    maxPayloadSize: 2048,
    allowAppSessionAuth: MASTERMIND_APP_SESSION,
    stepUpExempt: (user) => isFleetOwner(user),
  }
);
