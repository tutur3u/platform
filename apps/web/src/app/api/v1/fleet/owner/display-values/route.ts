import {
  fleetDisplayValueInputSchema,
  fleetDisplayValueResultSchema,
} from '@tuturuuu/internal-api/fleet';
import { parseFleetRequest } from '../../intent-request';
import { callFleetOwner } from '../owner-db';
import { withFleetOwner } from '../owner-session';

/** Approves or removes one digest display value. */
export const POST = withFleetOwner(
  async (actorId, request) => {
    const parsed = await parseFleetRequest(
      request,
      fleetDisplayValueInputSchema
    );
    if (parsed.error) return parsed.error;
    return callFleetOwner(
      'fleet_owner_set_display_value',
      {
        p_actor_id: actorId,
        p_project_key: parsed.data.projectKey,
        p_field: parsed.data.field,
        p_value: parsed.data.value,
        p_approved: parsed.data.approved,
      },
      fleetDisplayValueResultSchema
    );
  },
  { mutation: true }
);
