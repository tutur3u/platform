import {
  fleetRevokeInputSchema,
  fleetRevokeResultSchema,
} from '@tuturuuu/internal-api/fleet';
import { parseFleetRequest } from '../../../intent-request';
import { callFleetOwner } from '../../owner-db';
import { withFleetOwner } from '../../owner-session';

export const POST = withFleetOwner(
  async (actorId, request) => {
    const parsed = await parseFleetRequest(request, fleetRevokeInputSchema);
    if (parsed.error) return parsed.error;
    return callFleetOwner(
      'fleet_owner_revoke_access',
      {
        p_actor_id: actorId,
        p_user_id: parsed.data.userId,
        p_expected_generation: parsed.data.expectedGeneration,
      },
      fleetRevokeResultSchema
    );
  },
  { mutation: true }
);
