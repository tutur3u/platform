import '@tanstack/react-start/server-only';
import { resetMeetGuestPassword } from '@tuturuuu/apis/meet/guest-password-reset';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

export async function resetGuestPassword(
  planId: string,
  guestName: string,
  password: string
) {
  const actor = await getSatelliteAppSessionUser('meet');
  if (!actor) return { error: 'UNAUTHORIZED' as const };
  return resetMeetGuestPassword({
    client: await createAdminClient({ noCookie: true }),
    actorUserId: actor.id,
    input: { planId, guestName, password },
  });
}
