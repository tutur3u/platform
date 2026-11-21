import { fleetAccessSchema } from '@tuturuuu/internal-api/fleet';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { fleetJson, withFleetSession } from '../session';

export const GET = withFleetSession(async (actorId) => {
  try {
    const db = await createAdminClient({ noCookie: true });
    const { data, error } = await db.schema('private').rpc('fleet_get_access', {
      p_actor_id: actorId,
    });
    if (!error) {
      const access = fleetAccessSchema.safeParse(data);
      if (access.success) return fleetJson(access.data);
    }
  } catch {
    // Use the same response for database and configuration failures.
  }
  console.error('Fleet access lookup failed');
  return fleetJson({ error: 'access_unavailable' }, 503);
});
