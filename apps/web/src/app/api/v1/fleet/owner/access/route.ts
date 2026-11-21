import { fleetOwnerConsoleSchema } from '@tuturuuu/internal-api/fleet';
import { callFleetOwner } from '../owner-db';
import { withFleetOwner } from '../owner-session';

export const GET = withFleetOwner(
  (actorId) =>
    callFleetOwner(
      'fleet_owner_list_access',
      { p_actor_id: actorId },
      fleetOwnerConsoleSchema
    ),
  { mutation: false }
);
