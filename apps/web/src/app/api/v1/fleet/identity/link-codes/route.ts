import { z } from 'zod';
import { getFleetIntentDb } from '../../intent-db';
import {
  createFleetCode,
  fleetCodeHash,
  fleetUnavailable,
  parseFleetRequest,
} from '../../intent-request';
import { fleetJson, withFleetSession } from '../../session';

export const POST = withFleetSession(async (actorId, request) => {
  const parsed = await parseFleetRequest(request, z.strictObject({}));
  if (parsed.error) return parsed.error;

  const code = createFleetCode();
  try {
    const db = await getFleetIntentDb();
    const { data, error } = await db.rpc('fleet_create_link_code', {
      p_actor_id: actorId,
      p_code_hash: fleetCodeHash(code),
    });
    if (error) return fleetUnavailable();
    if (data === false) return fleetJson({ error: 'forbidden' }, 403);
    return data === true
      ? fleetJson({ code, expiresIn: 600 }, 201)
      : fleetUnavailable();
  } catch {
    return fleetUnavailable();
  }
}, 'mastermind');
