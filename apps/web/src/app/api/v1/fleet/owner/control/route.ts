import {
  fleetControlInputSchema,
  fleetControlResultSchema,
} from '@tuturuuu/internal-api/fleet';
import { parseFleetRequest } from '../../intent-request';
import { callFleetOwner } from '../owner-db';
import { withFleetOwner } from '../owner-session';

/** Fleet stop and resume. */
export const POST = withFleetOwner(
  async (actorId, request) => {
    const parsed = await parseFleetRequest(request, fleetControlInputSchema);
    if (parsed.error) return parsed.error;
    return callFleetOwner(
      'fleet_owner_set_stopped',
      {
        p_actor_id: actorId,
        p_stopped: parsed.data.stopped,
        p_expected_generation: parsed.data.expectedGeneration,
      },
      fleetControlResultSchema
    );
  },
  { mutation: true }
);
