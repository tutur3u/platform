import { z } from 'zod';
import { getFleetIntentDb } from '../../intent-db';
import {
  fleetCodeHash,
  fleetCodeSchema,
  fleetUnavailable,
  parseFleetRequest,
} from '../../intent-request';
import { fleetJson, withFleetSession } from '../../session';

const confirmationSchema = z.strictObject({
  linkId: z.uuid(),
  confirmationCode: fleetCodeSchema,
  preview: z.boolean().optional(),
});

const linkDisplay = {
  channel: z.enum(['whatsapp', 'zalo', 'discord']),
  accountLabel: z.string().min(1).max(80),
};
const confirmationResult = z.discriminatedUnion('reason', [
  z.strictObject({ reason: z.literal('pending'), ...linkDisplay }),
  z.strictObject({ reason: z.literal('confirmed'), ...linkDisplay }),
  z.strictObject({
    reason: z.enum([
      'identity_already_linked',
      'inactive_grant',
      'invalid_confirmation',
    ]),
  }),
]);

export const POST = withFleetSession(async (actorId, request) => {
  const parsed = await parseFleetRequest(request, confirmationSchema);
  if (parsed.error) return parsed.error;

  try {
    const db = await getFleetIntentDb();
    const { data, error } = await db.rpc('fleet_confirm_link_code', {
      p_actor_id: actorId,
      p_pending_id: parsed.data.linkId,
      p_confirmation_hash: fleetCodeHash(parsed.data.confirmationCode),
      p_preview: parsed.data.preview,
    });
    if (error) return fleetUnavailable();
    const result = confirmationResult.safeParse(data);
    if (!result.success) return fleetUnavailable();
    switch (result.data.reason) {
      case 'pending':
      case 'confirmed':
        return fleetJson({
          linked: result.data.reason === 'confirmed',
          channel: result.data.channel,
          accountLabel: result.data.accountLabel,
        });
      case 'identity_already_linked':
        return fleetJson({ error: result.data.reason }, 409);
      case 'inactive_grant':
      case 'invalid_confirmation':
        return fleetJson({ error: result.data.reason }, 403);
    }
  } catch {
    return fleetUnavailable();
  }
}, 'mastermind');
