import { z } from 'zod';
import { authorizeCalendarEventManagement } from '../../calendar-event-permission';
import { ColorOperationError } from './protocol';

const Retained = z
  .object({
    generation: z.string().regex(/^[1-9][0-9]*$/),
    pending: z.boolean(),
    intentKind: z.string(),
    phase: z.enum([
      'reserved',
      'prepared',
      'dispatched',
      'applied',
      'superseded',
      'canceled',
    ]),
    operationId: z.guid().nullable(),
  })
  .strict();
/** Flag-independent actor-authorized guard for every outbound/local writer.
 * Null preserves the ledgerless path; retained tombstones are discoverable even
 * after the event moved to another provider or was deleted. */
export async function getCalendarRetainedGeneration(
  request: Request,
  rawWsId: string,
  eventId: string
) {
  z.guid().parse(eventId);
  const authorized = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in authorized)
    throw new ColorOperationError(
      authorized.error.status >= 500 ? 'storage' : 'unauthorized',
      'Calendar generation access unavailable'
    );
  const { data, error } = await authorized.sbAdmin.rpc(
    'calendar_retained_generation',
    {
      p_ws_id: authorized.wsId,
      p_event_id: eventId,
      p_actor_id: authorized.userId,
    }
  );
  if (error)
    throw new ColorOperationError(
      error.code === '42501' ? 'unauthorized' : 'storage',
      'Calendar generation unavailable'
    );
  if (data === null) return null;
  return Retained.parse(data);
}
