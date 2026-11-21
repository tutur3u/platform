import { connection } from 'next/server';
import { z } from 'zod';
import {
  authenticateFleetDesk,
  fleetDeskDenied,
  verifyFleetDeskEvent,
} from '../../desk-event';
import { summarizeStoredFleetDigest } from '../../digest-sections';
import { getFleetIntentDb } from '../../intent-db';
import { fleetUnavailable, parseFleetRequest } from '../../intent-request';
import { fleetJson } from '../../session';

const inputSchema = z.strictObject({});
const resultSchema = z.discriminatedUnion('reason', [
  z.strictObject({
    reason: z.literal('accepted'),
    sections: z.array(z.unknown()),
  }),
  z.strictObject({
    reason: z.enum([
      'unauthorized_desk_event',
      'event_replayed',
      'unlinked_identity',
      'fleet_stopped',
      'inactive_grant',
      'missing_capability',
      'questions_per_hour',
    ]),
  }),
]);

export async function POST(request: Request) {
  await connection();
  const desk = authenticateFleetDesk(request);
  if (!desk) return fleetDeskDenied();
  const parsed = await parseFleetRequest(request, inputSchema);
  if (parsed.error) return parsed.error;
  const event = verifyFleetDeskEvent(
    request,
    desk,
    parsed.bytes,
    'digest.read'
  );
  if (!event) return fleetDeskDenied();

  try {
    const db = await getFleetIntentDb();
    const { data, error } = await db.rpc('fleet_read_desk_digest', {
      p_event: event,
    });
    if (error) return fleetUnavailable();
    const result = resultSchema.safeParse(data);
    if (!result.success) return fleetUnavailable();
    const { reason } = result.data;
    switch (reason) {
      case 'accepted':
        return fleetJson(summarizeStoredFleetDigest(result.data.sections));
      case 'unauthorized_desk_event':
        return fleetDeskDenied();
      case 'event_replayed':
        return fleetJson({ error: reason }, 409);
      case 'questions_per_hour':
        return fleetJson({ error: reason }, 429);
      default:
        return fleetJson({ error: reason }, 403);
    }
  } catch {
    return fleetUnavailable();
  }
}
