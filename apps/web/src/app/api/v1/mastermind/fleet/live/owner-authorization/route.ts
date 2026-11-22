import { isUserCurrentlySuspended } from '@tuturuuu/utils/abuse-protection/user-suspension';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isFleetOwner } from '@/lib/mastermind/fleet/auth';
import {
  FLEET_NO_STORE,
  fleetError,
  readCappedText,
} from '@/lib/mastermind/fleet/http';

import { hasOwnerNoticeServiceCredential } from '@/lib/mastermind/fleet/owner-notice-auth';

const noticeOwner = z.object({ ownerId: z.uuid() }).strict();

/** The store rechecks a ticket-bound recipient before every owner notice. */
export async function POST(request: NextRequest) {
  if (!hasOwnerNoticeServiceCredential(request))
    return fleetError('unauthorized', 401);

  const text = await readCappedText(request, 128);
  if (text === null) return fleetError('bad_request', 400);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fleetError('bad_request', 400);
  }
  const parsed = noticeOwner.safeParse(body);
  if (!parsed.success) return fleetError('bad_request', 400);
  const { ownerId } = parsed.data;
  if (!(await isFleetOwner({ id: ownerId })))
    return fleetError('forbidden', 403);
  try {
    if (await isUserCurrentlySuspended(ownerId))
      return fleetError('forbidden', 403);
  } catch {
    return fleetError('unavailable', 503);
  }
  return new NextResponse(null, { status: 204, headers: FLEET_NO_STORE });
}
