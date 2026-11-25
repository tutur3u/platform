import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  withdrawMiraAccount,
  withdrawPrivateLiveSessions,
} from '@tuturuuu/meet-core/features/live-assistant/privacy-reset';
import { readLiveRequestBody } from '@tuturuuu/meet-core/features/live-assistant/request-body';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { z } from 'zod';

const headers = { 'Cache-Control': 'private, no-store' };
const schema = z.object({ expectedActorId: z.uuid() }).strict();

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  const user = await getSatelliteAppSessionUser('meet');
  if (!user)
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  const body = await readLiveRequestBody(request, 1000);
  if (!body.ok)
    return Response.json(
      { error: 'Invalid request body' },
      { status: body.status, headers }
    );
  const input = schema.safeParse(body.data);
  if (!input.success)
    return Response.json(
      { error: 'Invalid request' },
      { status: 400, headers }
    );
  try {
    await withdrawMiraAccount({ user }, input.data.expectedActorId);
    // Ends Private Mira and any shared tutor chat in the owner's meetings.
    await withdrawPrivateLiveSessions(user.id);
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const status = error instanceof MeetCallAccessError ? error.status : 503;
    return Response.json(
      { error: 'Mira confirmation could not be withdrawn' },
      { status, headers }
    );
  }
}
