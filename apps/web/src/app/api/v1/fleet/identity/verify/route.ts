import { connection } from 'next/server';
import { z } from 'zod';
import {
  authenticateFleetDesk,
  fleetDeskDenied,
  verifyFleetDeskEvent,
} from '../../desk-event';
import { getFleetIntentDb } from '../../intent-db';
import {
  createFleetCode,
  fleetCodeHash,
  fleetCodeSchema,
  fleetUnavailable,
  parseFleetRequest,
} from '../../intent-request';
import { fleetJson } from '../../session';

const verifySchema = z.strictObject({ code: fleetCodeSchema });
const pendingSchema = z.discriminatedUnion('reason', [
  z.strictObject({ reason: z.literal('pending'), linkId: z.uuid() }),
  z.strictObject({ reason: z.literal('event_replayed') }),
  z.strictObject({ reason: z.literal('unauthorized_desk_event') }),
  z.strictObject({ reason: z.literal('invalid_link_code') }),
]);

export async function POST(request: Request) {
  await connection();
  const desk = authenticateFleetDesk(request);
  if (!desk) return fleetDeskDenied();

  const parsed = await parseFleetRequest(request, verifySchema);
  if (parsed.error) return parsed.error;
  const event = verifyFleetDeskEvent(
    request,
    desk,
    parsed.bytes,
    'identity.verify'
  );
  if (!event) return fleetDeskDenied();

  const confirmationCode = createFleetCode();
  try {
    const db = await getFleetIntentDb();
    const { data, error } = await db.rpc('fleet_verify_link_code', {
      p_code_hash: fleetCodeHash(parsed.data.code),
      p_confirmation_hash: fleetCodeHash(confirmationCode),
      p_event: event,
    });
    if (error) return fleetUnavailable();
    const result = pendingSchema.safeParse(data);
    if (!result.success) return fleetUnavailable();

    switch (result.data.reason) {
      case 'pending':
        return fleetJson({ linkId: result.data.linkId, confirmationCode }, 201);
      case 'unauthorized_desk_event':
        return fleetDeskDenied();
      case 'event_replayed':
        return fleetJson({ error: result.data.reason }, 409);
      case 'invalid_link_code':
        return fleetJson({ error: result.data.reason }, 403);
    }
  } catch {
    return fleetUnavailable();
  }
}
