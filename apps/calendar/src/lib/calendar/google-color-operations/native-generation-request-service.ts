import type { Json } from '@tuturuuu/types/db';
import { z } from 'zod';
import { authorizeCalendarEventManagement } from '../../calendar-event-permission';
import { ColorOperationError } from './protocol';

const Patch = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    location: z.string().nullable().optional(),
    is_encrypted: z.literal(true).optional(),
    start_at: z.string().optional(),
    end_at: z.string().optional(),
    locked: z.boolean().optional(),
    color: z.string().optional(),
  })
  .strict()
  .refine(
    (patch) =>
      !('title' in patch || 'description' in patch || 'location' in patch) ||
      patch.is_encrypted === true,
    'Content patches must already be encrypted'
  );
/** Inspect before preparing an edit; the final write compares that exact retained
 * generation. Ledgerless native events preserve their ordinary local path. */
export function createRequestNativeGenerationService(
  request: Request,
  rawWsId: string,
  eventId: string
) {
  z.guid().parse(eventId);
  let actorId: string | undefined;
  async function rpc(action: string, input: Record<string, unknown>) {
    const authorized = await authorizeCalendarEventManagement(request, rawWsId);
    if ('error' in authorized || (actorId && actorId !== authorized.userId))
      throw new ColorOperationError(
        'unauthorized',
        'Native calendar access unavailable'
      );
    actorId = authorized.userId;
    const { data, error } = await authorized.sbAdmin.rpc(
      'calendar_native_generation_mutation',
      {
        p_action: action,
        p_ws_id: authorized.wsId,
        p_event_id: eventId,
        p_actor_id: authorized.userId,
        p_input: input as Json,
      }
    );
    if (error)
      throw new ColorOperationError(
        error.code === '40001'
          ? 'conflict'
          : error.code === '42501'
            ? 'unauthorized'
            : 'storage',
        'Native calendar mutation unavailable'
      );
    return data;
  }
  return {
    async inspect() {
      const current = z
        .object({
          generation: z.string().regex(/^(0|[1-9][0-9]*)$/),
          pending: z.boolean(),
        })
        .parse(await rpc('inspect', {}));
      if (current.pending)
        throw new ColorOperationError(
          'conflict',
          'Provider operation in progress'
        );
      return current.generation;
    },
    patch(expectedGeneration: string, patch: z.infer<typeof Patch>) {
      z.string()
        .regex(/^(0|[1-9][0-9]*)$/)
        .parse(expectedGeneration);
      return rpc('patch', { expectedGeneration, patch: Patch.parse(patch) });
    },
    delete(expectedGeneration: string) {
      z.string()
        .regex(/^(0|[1-9][0-9]*)$/)
        .parse(expectedGeneration);
      return rpc('delete', { expectedGeneration });
    },
  };
}
