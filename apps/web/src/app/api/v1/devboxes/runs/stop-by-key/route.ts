import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';
import { limitDevboxStopByKey } from '@/lib/devboxes/rate-limits';
import { stopDevboxRunByKey } from '@/lib/devboxes/store';
import { DEVBOX_IDEMPOTENCY_KEY_PATTERN } from '@/lib/devboxes/store-run-idempotency';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

const StopByKeySchema = z.object({
  idempotencyKey: z.string().regex(DEVBOX_IDEMPOTENCY_KEY_PATTERN),
});

// Lets a client that lost a create acknowledgement (for example after Ctrl-C)
// cancel the run by the operation ID it sent. Scoped to the caller's runs.
export async function POST(request: NextRequest) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;

  const limited = await limitDevboxStopByKey(authorization.user.id);
  if (!('allowed' in limited)) return limited;

  const parsed = StopByKeySchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      await stopDevboxRunByKey({
        actorId: authorization.user.id,
        idempotencyKey: parsed.data.idempotencyKey,
      })
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(error, 'Failed to stop devbox run');
  }
}
