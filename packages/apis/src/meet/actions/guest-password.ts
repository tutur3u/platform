'use server';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { resetMeetGuestPassword } from '../guest-password-reset';

export async function resetGuestPassword(
  planId: string,
  guestName: string,
  password: string
) {
  const { user } = await resolveAuthenticatedSessionUser(await createClient());
  if (!user) return { error: 'UNAUTHORIZED' as const };
  return resetMeetGuestPassword({
    client: await createAdminClient(),
    actorUserId: user.id,
    input: { planId, guestName, password },
  });
}
