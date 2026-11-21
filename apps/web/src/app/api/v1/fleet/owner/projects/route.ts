import {
  fleetProjectInputSchema,
  fleetProjectResultSchema,
} from '@tuturuuu/internal-api/fleet';
import { parseFleetRequest } from '../../intent-request';
import { callFleetOwner } from '../owner-db';
import { withFleetOwner } from '../owner-session';

/** Creates a catalog project or renames one. */
export const POST = withFleetOwner(
  async (actorId, request) => {
    const parsed = await parseFleetRequest(request, fleetProjectInputSchema);
    if (parsed.error) return parsed.error;
    return callFleetOwner(
      'fleet_owner_upsert_project',
      {
        p_actor_id: actorId,
        p_key: parsed.data.key,
        p_name_en: parsed.data.nameEn,
        p_name_vi: parsed.data.nameVi,
      },
      fleetProjectResultSchema
    );
  },
  { mutation: true }
);
