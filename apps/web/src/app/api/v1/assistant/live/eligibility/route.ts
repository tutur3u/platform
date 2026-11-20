import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveMobileLiveBillingWorkspace } from '@/lib/live/mobile-billing';
import { liveEligibilityResponse } from '../../../live/eligibility/shared';

const requestSchema = z.object({ wsId: z.string().trim().min(1).max(128) });

/** Mobile Live bills the actor's personal workspace, as the token route does. */
export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
  return liveEligibilityResponse({
    request,
    wsId: parsed.data.wsId,
    resolveBillingWsId: ({ userId }) =>
      resolveMobileLiveBillingWorkspace(userId),
  });
}
